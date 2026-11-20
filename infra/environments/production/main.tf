# Production Environment — Main Orchestration

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  backend "s3" {
    bucket         = "lamssa-prod-tfstate"
    key            = "production/terraform.tfstate"
    region         = "me-central2" # In-country region: Dammam, Saudi Arabia
    encrypt        = true
    dynamodb_table = "lamssa-prod-tflock"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "Lamssa"
      Environment = "production"
      ManagedBy   = "OpenTofu"
      Compliance  = "Saudi-PDPL-NCA-ECC"
    }
  }
}

data "aws_caller_identity" "current" {}

# 1. KMS Root Keys
module "kms" {
  source      = "../../modules/kms"
  environment = "production"
  tags        = var.tags
}

# 2. Multi-AZ Isolated Networking
module "networking" {
  source             = "../../modules/networking"
  environment        = "production"
  region             = var.region
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  tags               = var.tags
}

# 3. Encrypted Object Storage with Object Lock WORM
module "object_storage" {
  source                     = "../../modules/object-storage"
  environment                = "production"
  account_id                 = data.aws_caller_identity.current.account_id
  kms_key_arn                = module.kms.object_storage_kms_key_arn
  backup_worm_retention_days = 30
  tags                       = var.tags
}

# 4. Secrets Containers
module "secrets" {
  source      = "../../modules/secrets"
  environment = "production"
  kms_key_arn = module.kms.database_kms_key_arn
  tags        = var.tags
}

# 5. Multi-AZ PostgreSQL HA Cluster
module "postgres" {
  source                     = "../../modules/postgres"
  environment                = "production"
  database_subnet_ids        = module.networking.database_subnet_ids
  database_security_group_id = module.networking.database_security_group_id
  kms_key_arn                = module.kms.database_kms_key_arn
  instance_class             = var.db_instance_class
  allocated_storage_gb       = 100
  max_allocated_storage_gb   = 1000
  enable_multi_az            = true
  backup_retention_days      = 30
  admin_password_secret_ref  = "arn:aws:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:production/lamssa/database/admin_password"
  tags                       = var.tags
}

# 6. Kubernetes Cluster
module "kubernetes" {
  source                    = "../../modules/kubernetes"
  environment               = "production"
  kubernetes_version        = "1.30"
  subnet_ids                = module.networking.application_subnet_ids
  cluster_security_group_id = module.networking.app_compute_security_group_id
  cluster_role_arn          = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/lamssa-prod-eks-cluster-role"
  node_role_arn             = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/lamssa-prod-eks-node-role"
  enable_public_api_endpoint = false # Private control plane
  node_instance_types       = ["m6i.xlarge"]
  node_desired_count        = 4
  node_min_count            = 3
  node_max_count            = 12
  tags                      = var.tags
}

# 7. Workload Identity & Least Privilege IAM
module "iam" {
  source                     = "../../modules/iam"
  environment                = "production"
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

# 8. Monitoring & Telemetry
module "monitoring" {
  source             = "../../modules/monitoring"
  environment        = "production"
  kms_key_arn        = module.kms.database_kms_key_arn
  log_retention_days = 90
  tags               = var.tags
}
