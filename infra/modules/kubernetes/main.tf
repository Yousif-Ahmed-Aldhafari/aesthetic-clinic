# Google Cloud Kubernetes Module — Private GKE Cluster, Node Pools, Workload Identity

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

resource "google_container_cluster" "primary" {
  name     = "${var.environment}-lamssa-gke"
  location = var.region

  network    = var.network_id
  subnetwork = var.app_subnet_id

  remove_default_node_pool = true
  initial_node_count       = 1

  ip_allocation_policy {
    cluster_secondary_range_name  = "gke-pods"
    services_secondary_range_name = "gke-services"
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = true
    master_ipv4_cidr_block  = var.master_ipv4_cidr
  }

  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.allowed_management_cidrs
      content {
        cidr_block   = cidr_blocks.value
        display_name = "management-allowlist"
      }
    }
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  addons_config {
    network_policy_config {
      disabled = false
    }
    http_load_balancing {
      disabled = false
    }
  }

  database_encryption {
    state    = "ENCRYPTED"
    key_name = var.kms_key_name
  }

  enable_shielded_nodes = true

  release_channel {
    channel = "REGULAR"
  }
}

resource "google_container_node_pool" "app_nodes" {
  name       = "${var.environment}-lamssa-app-nodes"
  location   = var.region
  cluster    = google_container_cluster.primary.name
  node_count = var.min_node_count

  autoscaling {
    min_node_count = var.min_node_count
    max_node_count = var.max_node_count
  }

  node_config {
    machine_type = var.node_machine_type
    disk_type    = "pd-ssd"
    disk_size_gb = 50

    service_account = var.node_service_account
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    labels = {
      environment = var.environment
      workload    = "lamssa-healthcare"
    }

    tags = ["lamssa-gke-node"]
  }
}
