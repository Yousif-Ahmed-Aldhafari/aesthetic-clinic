variable "environment" {
  type    = string
  default = "production"
}

variable "region" {
  type        = string
  description = "Target Google Cloud region: Dammam, Saudi Arabia"
  default     = "me-central2"
}

variable "project_id" {
  type        = string
  description = "Google Cloud Project ID for Production"
  default     = "lamssa-production-sa"
}

variable "app_db_password" {
  type      = string
  sensitive = true
  default   = "PROD_APP_PLACEHOLDER_SET_VIA_ENV"
}

variable "migrator_db_password" {
  type      = string
  sensitive = true
  default   = "PROD_MIGRATOR_PLACEHOLDER_SET_VIA_ENV"
}

variable "alert_email" {
  type    = string
  default = "sre-prod@lamssa.sa"
}

variable "tags" {
  type    = map(string)
  default = {}
}
