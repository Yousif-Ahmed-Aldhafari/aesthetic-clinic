# KMS Module — Customer-Managed KEKs, FIPS 140-2 Level 3 HSM, and Rotation Policies

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

# 1. Primary Database Storage KEK
resource "aws_kms_key" "database" {
  description             = "KEK for Lamssa PostgreSQL storage encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Environment = var.environment
    Domain      = "DatabaseStorage"
  })
}

resource "aws_kms_alias" "database" {
  name          = "alias/${var.environment}-lamssa-database-kek"
  target_key_id = aws_kms_key.database.key_id
}

# 2. Clinical Media & Documents KEK (Envelope Encryption Root)
resource "aws_kms_key" "clinical_media" {
  description             = "KEK for wrapping tenant DEKs for clinical media and documents"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Environment = var.environment
    Domain      = "ClinicalMediaEnvelope"
  })
}

resource "aws_kms_alias" "clinical_media" {
  name          = "alias/${var.environment}-lamssa-clinical-media-kek"
  target_key_id = aws_kms_key.clinical_media.key_id
}

# 3. Object Storage SSE-KMS Key
resource "aws_kms_key" "object_storage" {
  description             = "KEK for S3 bucket default server-side encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Environment = var.environment
    Domain      = "ObjectStorage"
  })
}

resource "aws_kms_alias" "object_storage" {
  name          = "alias/${var.environment}-lamssa-storage-kek"
  target_key_id = aws_kms_key.object_storage.key_id
}
