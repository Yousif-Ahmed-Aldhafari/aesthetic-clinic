variable "environment" {
  type        = string
  description = "Target deployment environment"
}

variable "kms_key_arn" {
  type        = string
  description = "Customer Managed KMS Key ARN for log encryption"
}

variable "log_retention_days" {
  type        = number
  description = "Operational log retention period in days"
  default     = 90
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
