variable "environment" {
  type = string
}

variable "region" {
  type    = string
  default = "me-central2"
}

variable "kms_key_name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
