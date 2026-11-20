variable "environment" {
  type = string
}

variable "region" {
  type    = string
  default = "me-central2"
}

variable "tags" {
  type    = map(string)
  default = {}
}
