variable "environment" {
  type        = string
  description = "Target deployment environment (development, staging, production)"
}

variable "region" {
  type        = string
  description = "Target sovereign cloud region (e.g. me-central2)"
}

variable "vpc_cidr" {
  type        = string
  description = "Primary CIDR block for the Virtual Private Cloud"
  default     = "10.100.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of distinct Availability Zones for multi-AZ fault tolerance"
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for governance and billing attribution"
  default     = {}
}
