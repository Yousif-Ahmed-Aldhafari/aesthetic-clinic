# Google Cloud PostgreSQL Module — Regional Cloud SQL HA, Private IP, CMEK, SCRAM-SHA-256

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

resource "google_sql_database_instance" "primary" {
  name             = "${var.environment}-lamssa-pg16"
  database_version = "POSTGRES_16"
  region           = var.region

  depends_on = [var.private_connection_id]

  encryption_key_name = var.kms_key_name

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.allocated_storage_gb
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.network_id
      require_ssl                                   = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "01:00"
      transaction_log_retention_days = 7
    }

    database_flags {
      name  = "password_encryption"
      value = "scram-sha-256"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_min_messages"
      value = "warning"
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 3
      update_track = "stable"
    }

    user_labels = merge(var.tags, {
      environment = var.environment
      compliance  = "saudi-moh-pdpl"
    })
  }

  deletion_protection = var.environment == "production" ? true : false
}

resource "google_sql_database" "database" {
  name      = "lamssa_${var.environment}"
  instance  = google_sql_database_instance.primary.name
  charset   = "UTF8"
  collation = "en_US.UTF8"
}

resource "google_sql_user" "runtime_user" {
  name     = "lamssa_app"
  instance = google_sql_database_instance.primary.name
  password = var.app_password
  type     = "BUILT_IN"
}

resource "google_sql_user" "migrator_user" {
  name     = "lamssa_migrator"
  instance = google_sql_database_instance.primary.name
  password = var.migrator_password
  type     = "BUILT_IN"
}
