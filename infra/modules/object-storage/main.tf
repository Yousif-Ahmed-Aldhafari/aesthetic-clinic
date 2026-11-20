# Object Storage Module — Encrypted S3/GCS Buckets, Object Lock WORM, and Private Access

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

# 1. Clinical Media & Documents Bucket
resource "aws_s3_bucket" "clinical_assets" {
  bucket        = "${var.environment}-lamssa-clinical-assets-${var.account_id}"
  force_destroy = var.environment == "development" ? true : false

  # Enable Object Lock for WORM legal holds
  object_lock_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    DataTier    = "RestrictedClinicalMedia"
  })
}

resource "aws_s3_bucket_public_access_block" "clinical_assets" {
  bucket = aws_s3_bucket.clinical_assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "clinical_assets" {
  bucket = aws_s3_bucket.clinical_assets.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "clinical_assets" {
  bucket = aws_s3_bucket.clinical_assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

# 2. Immutable Disaster Recovery Backups Bucket
resource "aws_s3_bucket" "dr_backups" {
  bucket        = "${var.environment}-lamssa-dr-backups-${var.account_id}"
  force_destroy = var.environment == "development" ? true : false

  object_lock_enabled = true

  tags = merge(var.tags, {
    Environment = var.environment
    DataTier    = "DisasterRecoveryBackups"
  })
}

resource "aws_s3_bucket_public_access_block" "dr_backups" {
  bucket = aws_s3_bucket.dr_backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dr_backups" {
  bucket = aws_s3_bucket.dr_backups.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "dr_backups" {
  bucket = aws_s3_bucket.dr_backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "dr_backups" {
  count  = var.environment == "production" ? 1 : 0
  bucket = aws_s3_bucket.dr_backups.id

  rule {
    default_retention {
      mode = "COMPLIANCE" # Cannot be bypassed by any cloud administrator
      days = var.backup_worm_retention_days
    }
  }
}
