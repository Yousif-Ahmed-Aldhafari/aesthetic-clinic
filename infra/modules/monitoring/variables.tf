variable "environment" {
  type = string
}

variable "alert_email" {
  type    = string
  default = "sre-alerts@lamssa.internal"
}

variable "audit_bucket_name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
