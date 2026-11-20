variable "environment" {
  type        = string
  description = "Target deployment environment (development, staging, production)"
}

variable "region" {
  type        = string
  description = "Target Google Cloud region (e.g. me-central2 in Dammam, Saudi Arabia)"
  default     = "me-central2"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.0.1.0/24"
}

variable "app_subnet_cidr" {
  type    = string
  default = "10.0.10.0/24"
}

variable "pods_cidr" {
  type    = string
  default = "10.1.0.0/16"
}

variable "services_cidr" {
  type    = string
  default = "10.2.0.0/20"
}

variable "data_subnet_cidr" {
  type    = string
  default = "10.0.20.0/24"
}

variable "tags" {
  type    = map(string)
  default = {}
}
