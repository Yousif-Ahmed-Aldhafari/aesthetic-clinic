output "api_service_account_email" {
  value = google_service_account.api_sa.email
}

output "migrator_service_account_email" {
  value = google_service_account.migrator_sa.email
}

output "gke_nodes_service_account_email" {
  value = google_service_account.gke_nodes_sa.email
}
