# PostgreSQL Module — Multi-AZ High Availability, Parameter Groups, and Storage Encryption

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

resource "aws_db_subnet_group" "db_subnets" {
  name        = "${var.environment}-lamssa-db-subnet-group"
  subnet_ids  = var.database_subnet_ids
  description = "Isolated private subnets for PostgreSQL cluster — zero internet routing"

  tags = var.tags
}

resource "aws_db_parameter_group" "pg16" {
  name        = "${var.environment}-lamssa-pg16-params"
  family      = "postgres16"
  description = "Hardened parameter group for Lamssa multi-tenant PostgreSQL"

  parameter {
    name  = "password_encryption"
    value = "scram-sha-256"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "statement_timeout"
    value = "30000" # 30 seconds max query duration
  }

  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "60000" # 60 seconds
  }

  tags = var.tags
}

resource "aws_db_instance" "primary" {
  identifier                  = "${var.environment}-lamssa-postgres-primary"
  engine                      = "postgres"
  engine_version              = "16.3"
  instance_class              = var.instance_class
  allocated_storage           = var.allocated_storage_gb
  max_allocated_storage       = var.max_allocated_storage_gb
  storage_type                = "gp3"
  storage_encrypted           = true
  kms_key_id                  = var.kms_key_arn

  db_name                     = "lamssa_${var.environment}"
  username                    = "postgres_admin"
  password                    = var.admin_password_secret_ref # Reference from Secret Manager in execution
  manage_master_user_password = false

  db_subnet_group_name        = aws_db_subnet_group.db_subnets.name
  vpc_security_group_ids      = [var.database_security_group_id]
  parameter_group_name        = aws_db_parameter_group.pg16.name

  multi_az                    = var.enable_multi_az
  publicly_accessible         = false # Strictly enforced: NEVER publicly accessible
  deletion_protection         = var.environment == "production" ? true : false
  skip_final_snapshot         = var.environment == "development" ? true : false
  final_snapshot_identifier   = "${var.environment}-lamssa-db-final-snapshot"

  backup_retention_period     = var.backup_retention_days
  backup_window               = "02:00-03:00"
  maintenance_window          = "Sun:03:30-Sun:04:30"
  auto_minor_version_upgrade  = false

  copy_tags_to_snapshot       = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = merge(var.tags, {
    Environment = var.environment
    Component   = "PrimaryDatabase"
    DataTier    = "RestrictedPHI"
  })
}
