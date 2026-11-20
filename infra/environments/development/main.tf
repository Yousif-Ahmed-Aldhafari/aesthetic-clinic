# Development Environment — Local / Container Simulation Orchestration

terraform {
  required_version = ">= 1.8.0"
}

# In local development, native Docker containers and compose are used.
# This definition acts as a declarative specification for local development topology.

variable "environment" {
  type    = string
  default = "development"
}

variable "database_port" {
  type    = number
  default = 5432
}

output "development_mode" {
  value = "local-docker-native"
}
