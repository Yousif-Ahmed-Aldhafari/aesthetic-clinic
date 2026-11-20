variable "environment" {
  type        = string
  description = "Target deployment environment"
}

variable "account_id" {
  type        = string
  description = "Cloud Account ID to ensure globally unique bucket names"
}

variable "kms_key_arn" {
  type        = string
  description = "Customer Managed KMS Key ARN for S3 SSE-KMS encryption"
}

variable "backup_worm_retention_days" {
  type        = number
  description = "Days of mandatory Compliance Mode WORM retention for DR backups"
  default     = 30
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
