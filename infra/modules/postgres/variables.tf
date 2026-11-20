variable "environment" {
  type = string
}

variable "region" {
  type    = string
  default = "me-central2"
}

variable "network_id" {
  type = string
}

variable "private_connection_id" {
  type = string
}

variable "kms_key_name" {
  type = string
}

variable "db_tier" {
  type    = string
  default = "db-custom-4-16384"
}

variable "allocated_storage_gb" {
  type    = number
  default = 100
}

variable "app_password" {
  type      = string
  sensitive = true
}

variable "migrator_password" {
  type      = string
  sensitive = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
