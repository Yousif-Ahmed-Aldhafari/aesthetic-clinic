variable "environment" {
  type    = string
  default = "staging"
}

variable "region" {
  type        = string
  description = "Target Google Cloud region: Dammam, Saudi Arabia"
  default     = "me-central2"
}

variable "project_id" {
  type        = string
  description = "Google Cloud Project ID for Staging"
  default     = "lamssa-staging-sa"
}

variable "app_db_password" {
  type      = string
  sensitive = true
  default   = "STAGING_APP_PLACEHOLDER_SET_VIA_ENV"
}

variable "migrator_db_password" {
  type      = string
  sensitive = true
  default   = "STAGING_MIGRATOR_PLACEHOLDER_SET_VIA_ENV"
}

variable "alert_email" {
  type    = string
  default = "sre-staging@lamssa.sa"
}

variable "tags" {
  type    = map(string)
  default = {}
}
