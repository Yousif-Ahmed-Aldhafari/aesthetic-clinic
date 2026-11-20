# Secrets Module — Encrypted Secrets Manager Containers for Runtime Injection

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

resource "aws_secretsmanager_secret" "app_db_password" {
  name                    = "${var.environment}/lamssa/database/app_password"
  description             = "Runtime password for lamssa_app role"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "development" ? 0 : 30

  tags = var.tags
}

resource "aws_secretsmanager_secret" "migrator_db_password" {
  name                    = "${var.environment}/lamssa/database/migrator_password"
  description             = "Migration runner password for lamssa_migrator role"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "development" ? 0 : 30

  tags = var.tags
}

resource "aws_secretsmanager_secret" "auth_csrf_secret" {
  name                    = "${var.environment}/lamssa/auth/csrf_secret"
  description             = "Anti-CSRF HMAC secret"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "development" ? 0 : 30

  tags = var.tags
}

resource "aws_secretsmanager_secret" "mfa_encryption_key" {
  name                    = "${var.environment}/lamssa/auth/mfa_encryption_key"
  description             = "AES-256 key for TOTP secrets at rest"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "development" ? 0 : 30

  tags = var.tags
}

resource "aws_secretsmanager_secret" "clinical_media_key" {
  name                    = "${var.environment}/lamssa/clinical/media_encryption_key"
  description             = "Root key for clinical media and document envelope derivation"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "development" ? 0 : 30

  tags = var.tags
}

resource "aws_secretsmanager_secret" "metrics_secret_key" {
  name                    = "${var.environment}/lamssa/observability/metrics_secret_key"
  description             = "API key for Prometheus metrics endpoint access"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "development" ? 0 : 30

  tags = var.tags
}
