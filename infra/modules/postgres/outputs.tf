output "endpoint" {
  value       = aws_db_instance.primary.endpoint
  description = "Connection endpoint for primary PostgreSQL instance"
}

output "address" {
  value       = aws_db_instance.primary.address
  description = "Hostname of primary PostgreSQL instance"
}

output "port" {
  value       = aws_db_instance.primary.port
  description = "Port number of primary PostgreSQL instance"
}

output "db_name" {
  value       = aws_db_instance.primary.db_name
  description = "Database name"
}

output "resource_id" {
  value       = aws_db_instance.primary.resource_id
  description = "RDS resource identifier"
}
