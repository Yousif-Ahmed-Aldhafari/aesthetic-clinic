variable "region" {
  type        = string
  description = "Target in-country sovereign region"
  default     = "me-central2"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block"
  default     = "10.100.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "Availability Zones list"
  default     = ["me-central2a", "me-central2b"]
}

variable "db_instance_class" {
  type        = string
  description = "Database instance class"
  default     = "db.t4g.large"
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
