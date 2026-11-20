# Google Cloud Secrets Module — Secret Manager with CMEK and Workload Identity

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

locals {
  secrets = [
    "app_db_password",
    "migrator_db_password",
    "auth_csrf_secret",
    "mfa_encryption_key",
    "clinical_media_key",
    "metrics_api_key",
  ]
}

resource "google_secret_manager_secret" "secret" {
  for_each  = toset(locals.secrets)
  secret_id = "${var.environment}_lamssa_${each.key}"

  replication {
    user_managed {
      replicas {
        location = var.region
        customer_managed_encryption {
          kms_key_name = var.kms_key_name
        }
      }
    }
  }

  labels = merge(var.tags, {
    environment = var.environment
    managed_by  = "opentofu"
  })
}
