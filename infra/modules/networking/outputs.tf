output "network_id" {
  value       = google_compute_network.main.id
  description = "VPC Network ID"
}

output "network_name" {
  value       = google_compute_network.main.name
  description = "VPC Network Name"
}

output "public_subnet_id" {
  value       = google_compute_subnetwork.public.id
  description = "Public Edge Subnet ID"
}

output "app_subnet_id" {
  value       = google_compute_subnetwork.app.id
  description = "Application Compute Subnet ID"
}

output "data_subnet_id" {
  value       = google_compute_subnetwork.data.id
  description = "Isolated Data Subnet ID"
}

output "private_connection_id" {
  value       = google_service_networking_connection.private_vpc_connection.id
  description = "Service Networking Peering Connection ID for Cloud SQL"
}
