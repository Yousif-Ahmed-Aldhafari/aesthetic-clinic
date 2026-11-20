# IAM Module — Workload Identity and Least-Privilege Service Account Roles

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

# 1. API Runtime Role (IRSA for lamssa-api)
data "aws_iam_policy_document" "api_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_issuer, "https://", "")}:sub"
      values   = ["system:serviceaccount:lamssa-${var.environment}:lamssa-api-sa"]
    }

    principals {
      identifiers = [var.oidc_provider_arn]
      type        = "Federated"
    }
  }
}

resource "aws_iam_role" "api_runtime" {
  name               = "${var.environment}-lamssa-api-runtime-role"
  assume_role_policy = data.aws_iam_policy_document.api_assume_role.json
  tags               = var.tags
}

resource "aws_iam_policy" "api_runtime" {
  name        = "${var.environment}-lamssa-api-runtime-policy"
  description = "Least-privilege policy for NestJS API container runtime"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3ClinicalAssetAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "${var.clinical_assets_bucket_arn}/*"
      },
      {
        Sid    = "KmsEnvelopeCrypto"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = [var.clinical_media_kms_key_arn]
      },
      {
        Sid    = "SecretsManagerRuntimeRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.runtime_secret_arns
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_runtime" {
  role       = aws_iam_role.api_runtime.name
  policy_arn = aws_iam_policy.api_runtime.arn
}

# 2. Database Migration Runner Role (IRSA for pre-deployment migration job)
data "aws_iam_policy_document" "migration_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_issuer, "https://", "")}:sub"
      values   = ["system:serviceaccount:lamssa-${var.environment}:lamssa-migration-sa"]
    }

    principals {
      identifiers = [var.oidc_provider_arn]
      type        = "Federated"
    }
  }
}

resource "aws_iam_role" "migration_runner" {
  name               = "${var.environment}-lamssa-migration-runner-role"
  assume_role_policy = data.aws_iam_policy_document.migration_assume_role.json
  tags               = var.tags
}

resource "aws_iam_policy" "migration_runner" {
  name        = "${var.environment}-lamssa-migration-runner-policy"
  description = "Access to migration database credentials for schema DDL execution"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadMigratorSecret"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [var.migrator_secret_arn]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "migration_runner" {
  role       = aws_iam_role.migration_runner.name
  policy_arn = aws_iam_policy.migration_runner.arn
}
