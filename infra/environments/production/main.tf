# Production Environment — Main Google Cloud Orchestration (me-central2 / Dammam, Saudi Arabia)

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }

  backend "gcs" {
    bucket = "lamssa-prod-tfstate"
    prefix = "production"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  default_labels = {
    project     = "lamssa"
    environment = "production"
    managed_by  = "opentofu"
    compliance  = "saudi-pdpl-moh"
  }
}

# 1. KMS Root Keys (KeyRing and Cloud HSM KEKs)
module "kms" {
  source      = "../../modules/kms"
  environment = "production"
  region      = var.region
  tags        = var.tags
}

# 2. Multi-Zone Zero-Trust VPC Networking & Cloud NAT
module "networking" {
  source      = "../../modules/networking"
  environment = "production"
  region      = var.region
  tags        = var.tags
}

# 3. Encrypted Clinical & Audit Object Storage (CMEK & WORM Bucket Lock)
module "object_storage" {
  source       = "../../modules/object-storage"
  environment  = "production"
  region       = var.region
  project_id   = var.project_id
  kms_key_name = module.kms.clinical_assets_kek_name
  tags         = var.tags
}

# 4. Secret Manager Secrets (CMEK-Encrypted)
module "secrets" {
  source       = "../../modules/secrets"
  environment  = "production"
  region       = var.region
  kms_key_name = module.kms.secrets_kek_name
  tags         = var.tags
}

# 5. Dedicated Workload Identity IAM & Least Privilege Service Accounts
module "iam" {
  source                      = "../../modules/iam"
  environment                 = "production"
  project_id                  = var.project_id
  clinical_assets_kek_name    = module.kms.clinical_assets_kek_name
  clinical_assets_bucket_name = module.object_storage.clinical_assets_bucket_name
}

# 6. Multi-Zone High Availability Cloud SQL PostgreSQL 16
module "postgres" {
  source                = "../../modules/postgres"
  environment           = "production"
  region                = var.region
  network_id            = module.networking.network_id
  private_connection_id = module.networking.private_connection_id
  kms_key_name          = module.kms.database_kek_name
  allocated_storage_gb  = 100
  app_password          = var.app_db_password
  migrator_password     = var.migrator_db_password
  tags                  = var.tags
}

# 7. Private GKE Cluster & Node Pools with Calico Network Policies
module "kubernetes" {
  source               = "../../modules/kubernetes"
  environment          = "production"
  region               = var.region
  project_id           = var.project_id
  network_id           = module.networking.network_id
  app_subnet_id        = module.networking.app_subnet_id
  kms_key_name         = module.kms.secrets_kek_name
  node_service_account = module.iam.gke_nodes_service_account_email
  min_node_count       = 3
  max_node_count       = 12
}

# 8. Observability & Centralized Audit Log Sink
module "monitoring" {
  source            = "../../modules/monitoring"
  environment       = "production"
  alert_email       = var.alert_email
  audit_bucket_name = module.object_storage.audit_archives_bucket_name
  tags              = var.tags
}
