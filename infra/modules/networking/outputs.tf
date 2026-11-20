output "vpc_id" {
  value       = aws_vpc.main.id
  description = "Identifier of the provisioned VPC"
}

output "public_subnet_ids" {
  value       = aws_subnet.public[*].id
  description = "Identifiers of public edge subnets"
}

output "application_subnet_ids" {
  value       = aws_subnet.application[*].id
  description = "Identifiers of private application subnets"
}

output "database_subnet_ids" {
  value       = aws_subnet.database[*].id
  description = "Identifiers of isolated private database subnets"
}

output "edge_alb_security_group_id" {
  value       = aws_security_group.edge_alb.id
  description = "Security group for edge load balancing"
}

output "app_compute_security_group_id" {
  value       = aws_security_group.app_compute.id
  description = "Security group for application compute"
}

output "database_security_group_id" {
  value       = aws_security_group.database.id
  description = "Security group for PostgreSQL and PgBouncer"
}
