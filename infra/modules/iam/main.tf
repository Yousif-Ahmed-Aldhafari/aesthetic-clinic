# Google Cloud IAM Module — Dedicated Service Accounts & Workload Identity Federation

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

# 1. API Runtime Service Account
resource "google_service_account" "api_sa" {
  account_id   = "${var.environment}-lamssa-api"
  display_name = "Lamssa API Workload Identity Service Account (${var.environment})"
  description  = "Least-privilege identity for NestJS API pods"
}

# Bind GKE ServiceAccount to Google Service Account via Workload Identity
resource "google_service_account_iam_member" "api_workload_identity" {
  service_account_id = google_service_account.api_sa.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[lamssa-system/lamssa-api-sa]"
}

# 2. Database Migrator Service Account
resource "google_service_account" "migrator_sa" {
  account_id   = "${var.environment}-lamssa-migrator"
  display_name = "Lamssa Database Migration Service Account (${var.environment})"
  description  = "Ephemeral migration Job identity"
}

resource "google_service_account_iam_member" "migrator_workload_identity" {
  service_account_id = google_service_account.migrator_sa.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[lamssa-system/lamssa-migration-sa]"
}

# 3. GKE Node Service Account
resource "google_service_account" "gke_nodes_sa" {
  account_id   = "${var.environment}-lamssa-gke-nodes"
  display_name = "Lamssa GKE Node Pool Service Account (${var.environment})"
  description  = "Minimal permissions for GKE compute nodes"
}

# Least-privilege IAM grants for GKE nodes
resource "google_project_iam_member" "node_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

resource "google_project_iam_member" "node_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

# API Runtime permissions: Cloud SQL Client, KMS Encrypter/Decrypter on Assets, Secret Accessor, Storage Object User
resource "google_project_iam_member" "api_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_kms_crypto_key_iam_member" "api_kms_assets" {
  crypto_key_id = var.clinical_assets_kek_name
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_storage_bucket_iam_member" "api_storage_assets" {
  bucket = var.clinical_assets_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.api_sa.email}"
}

# Migrator permissions: Cloud SQL Client
resource "google_project_iam_member" "migrator_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrator_sa.email}"
}
