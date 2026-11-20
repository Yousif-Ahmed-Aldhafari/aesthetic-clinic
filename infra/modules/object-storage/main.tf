# Google Cloud Object Storage Module — Encrypted Buckets, Bucket Lock (WORM), CMEK

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

# 1. Clinical Media & Documents Bucket
resource "google_storage_bucket" "clinical_assets" {
  name                        = "${var.environment}-lamssa-clinical-assets-${var.project_id}"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  encryption {
    default_kms_key_name = var.kms_key_name
  }

  versioning {
    enabled = true
  }

  retention_policy {
    is_locked        = var.environment == "production" ? true : false
    retention_period = 315360000 # 10 years (3650 days) in seconds
  }

  labels = merge(var.tags, {
    environment = var.environment
    tier        = "clinical-media"
  })

  force_destroy = var.environment == "development" ? true : false
}

# 2. Immutable Audit & Financial Event Logs Bucket
resource "google_storage_bucket" "audit_archives" {
  name                        = "${var.environment}-lamssa-audit-archives-${var.project_id}"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  encryption {
    default_kms_key_name = var.kms_key_name
  }

  versioning {
    enabled = true
  }

  retention_policy {
    is_locked        = var.environment == "production" ? true : false
    retention_period = 315360000 # 10 years
  }

  labels = merge(var.tags, {
    environment = var.environment
    tier        = "audit-archives"
  })

  force_destroy = var.environment == "development" ? true : false
}

# 3. Encrypted Disaster Recovery Database Backups Bucket
resource "google_storage_bucket" "backup_vault" {
  name                        = "${var.environment}-lamssa-backup-vault-${var.project_id}"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  encryption {
    default_kms_key_name = var.kms_key_name
  }

  versioning {
    enabled = true
  }

  retention_policy {
    is_locked        = var.environment == "production" ? true : false
    retention_period = 2592000 # 30 days
  }

  labels = merge(var.tags, {
    environment = var.environment
    tier        = "dr-backups"
  })

  force_destroy = var.environment == "development" ? true : false
}
