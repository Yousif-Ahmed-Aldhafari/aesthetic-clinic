# Staging Environment — Main Orchestration

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  backend "s3" {
    bucket         = "lamssa-staging-tfstate"
    key            = "staging/terraform.tfstate"
    region         = "me-central2"
    encrypt        = true
    dynamodb_table = "lamssa-staging-tflock"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "Lamssa"
      Environment = "staging"
      ManagedBy   = "OpenTofu"
      Compliance  = "Healthcare-PreProduction"
    }
  }
}

data "aws_caller_identity" "current" {}

module "kms" {
  source      = "../../modules/kms"
  environment = "staging"
  tags        = var.tags
}

module "networking" {
  source             = "../../modules/networking"
  environment        = "staging"
  region             = var.region
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  tags               = var.tags
}

module "object_storage" {
  source                     = "../../modules/object-storage"
  environment                = "staging"
  account_id                 = data.aws_caller_identity.current.account_id
  kms_key_arn                = module.kms.object_storage_kms_key_arn
  backup_worm_retention_days = 7
  tags                       = var.tags
}

module "secrets" {
  source      = "../../modules/secrets"
  environment = "staging"
  kms_key_arn = module.kms.database_kms_key_arn
  tags        = var.tags
}

module "postgres" {
  source                     = "../../modules/postgres"
  environment                = "staging"
  database_subnet_ids        = module.networking.database_subnet_ids
  database_security_group_id = module.networking.database_security_group_id
  kms_key_arn                = module.kms.database_kms_key_arn
  instance_class             = var.db_instance_class
  allocated_storage_gb       = 50
  max_allocated_storage_gb   = 200
  enable_multi_az            = true
  backup_retention_days      = 7
  admin_password_secret_ref  = "arn:aws:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:staging/lamssa/database/admin_password"
  tags                       = var.tags
}

module "kubernetes" {
  source                    = "../../modules/kubernetes"
  environment               = "staging"
  kubernetes_version        = "1.30"
  subnet_ids                = module.networking.application_subnet_ids
  cluster_security_group_id = module.networking.app_compute_security_group_id
  cluster_role_arn          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/lamssa-staging-eks-cluster-role"
  node_role_arn             = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/lamssa-staging-eks-node-role"
  enable_public_api_endpoint = false
  node_instance_types       = ["t3.large"]
  node_desired_count        = 2
  node_min_count            = 2
  node_max_count            = 4
  tags                      = var.tags
}

module "iam" {
  source                     = "../../modules/iam"
  environment                = "staging"
  oidc_provider_arn          = module.kubernetes.oidc_provider_arn
  oidc_issuer                = module.kubernetes.oidc_issuer
  clinical_assets_bucket_arn = module.object_storage.clinical_assets_bucket_arn
  clinical_media_kms_key_arn = module.kms.clinical_media_kms_key_arn
  runtime_secret_arns = [
    module.secrets.app_db_password_secret_arn,
    module.secrets.auth_csrf_secret_arn,
    module.secrets.mfa_encryption_key_arn,
    module.secrets.clinical_media_key_arn,
    module.secrets.metrics_secret_key_arn
  ]
  migrator_secret_arn = module.secrets.migrator_db_password_secret_arn
  tags                = var.tags
}

module "monitoring" {
  source             = "../../modules/monitoring"
  environment        = "staging"
  kms_key_arn        = module.kms.database_kms_key_arn
  log_retention_days = 30
  tags               = var.tags
}
