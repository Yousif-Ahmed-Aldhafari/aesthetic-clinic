output "instance_name" {
  value = google_sql_database_instance.primary.name
}

output "private_ip_address" {
  value = google_sql_database_instance.primary.private_ip_address
}

output "database_name" {
  value = google_sql_database.database.name
}

output "connection_name" {
  value = google_sql_database_instance.primary.connection_name
}
