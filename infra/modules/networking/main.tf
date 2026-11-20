# Google Cloud Networking Module — VPC, Private Subnets, Cloud NAT, and Firewall Rules

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

resource "google_compute_network" "main" {
  name                    = "${var.environment}-lamssa-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
  description             = "Dedicated zero-trust VPC for Lamssa ${var.environment}"
}

# 1. Edge Ingress Subnet (Load Balancer & Proxy)
resource "google_compute_subnetwork" "public" {
  name                     = "${var.environment}-lamssa-public-subnet"
  ip_cidr_range            = var.public_subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  private_ip_google_access = true
}

# 2. Private Application Compute Subnet (GKE Workloads)
resource "google_compute_subnetwork" "app" {
  name                     = "${var.environment}-lamssa-app-subnet"
  ip_cidr_range            = var.app_subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "gke-pods"
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = "gke-services"
    ip_cidr_range = var.services_cidr
  }
}

# 3. Isolated Data Subnet (PostgreSQL & Cache — Zero Internet Routing)
resource "google_compute_subnetwork" "data" {
  name                     = "${var.environment}-lamssa-data-subnet"
  ip_cidr_range            = var.data_subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  private_ip_google_access = true
}

# Cloud Router & NAT for Outbound Egress from Private App Subnet Only
resource "google_compute_router" "router" {
  name    = "${var.environment}-lamssa-router"
  region  = var.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "${var.environment}-lamssa-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.app.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }
}

# Private Service Access for Managed Services (Cloud SQL Private IP)
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "${var.environment}-lamssa-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

# Firewalls: Deny All Ingress by Default, Whitelist App & Health Checks
resource "google_compute_firewall" "deny_all_ingress" {
  name      = "${var.environment}-lamssa-deny-all"
  network   = google_compute_network.main.name
  priority  = 65534
  direction = "INGRESS"

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow_internal" {
  name      = "${var.environment}-lamssa-allow-internal"
  network   = google_compute_network.main.name
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["3000", "8080", "5432", "6432"]
  }

  source_ranges = [var.app_subnet_cidr, var.data_subnet_cidr]
}

resource "google_compute_firewall" "allow_health_checks" {
  name      = "${var.environment}-lamssa-allow-health-checks"
  network   = google_compute_network.main.name
  priority  = 900
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["8080", "3000"]
  }

  # Google Cloud Load Balancer and Health Check IP ranges
  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
}
