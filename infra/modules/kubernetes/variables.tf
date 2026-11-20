variable "environment" {
  type = string
}

variable "region" {
  type    = string
  default = "me-central2"
}

variable "project_id" {
  type = string
}

variable "network_id" {
  type = string
}

variable "app_subnet_id" {
  type = string
}

variable "master_ipv4_cidr" {
  type    = string
  default = "172.16.0.0/28"
}

variable "allowed_management_cidrs" {
  type    = list(string)
  default = ["10.0.0.0/8"]
}

variable "kms_key_name" {
  type = string
}

variable "node_machine_type" {
  type    = string
  default = "e2-standard-4"
}

variable "min_node_count" {
  type    = number
  default = 2
}

variable "max_node_count" {
  type    = number
  default = 10
}

variable "node_service_account" {
  type = string
}
