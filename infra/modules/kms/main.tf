# Google Cloud KMS Module — KeyRing, Cloud HSM KEKs, Rotation Policies

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

resource "google_kms_key_ring" "main" {
  name     = "${var.environment}-lamssa-keyring"
  location = var.region
}

# 1. Primary Database KEK
resource "google_kms_crypto_key" "database_kek" {
  name            = "${var.environment}-lamssa-database-kek"
  key_ring        = google_kms_key_ring.main.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 days

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "HSM"
  }

  labels = merge(var.tags, {
    environment = var.environment
    domain      = "database-storage"
  })
}

# 2. Clinical Assets & Documents KEK
resource "google_kms_crypto_key" "clinical_assets_kek" {
  name            = "${var.environment}-lamssa-clinical-assets-kek"
  key_ring        = google_kms_key_ring.main.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 days

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "HSM"
  }

  labels = merge(var.tags, {
    environment = var.environment
    domain      = "clinical-media"
  })
}

# 3. Secret Manager Envelope KEK
resource "google_kms_crypto_key" "secrets_kek" {
  name            = "${var.environment}-lamssa-secrets-kek"
  key_ring        = google_kms_key_ring.main.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 days

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "HSM"
  }

  labels = merge(var.tags, {
    environment = var.environment
    domain      = "secret-vault"
  })
}
