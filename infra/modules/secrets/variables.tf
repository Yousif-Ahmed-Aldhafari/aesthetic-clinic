variable "environment" {
  type        = string
  description = "Target deployment environment"
}

variable "kms_key_arn" {
  type        = string
  description = "Customer Managed KMS Key ARN for secret encryption"
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
