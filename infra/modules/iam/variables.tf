variable "environment" {
  type        = string
  description = "Target deployment environment"
}

variable "oidc_provider_arn" {
  type        = string
  description = "OIDC Provider ARN from Kubernetes cluster"
}

variable "oidc_issuer" {
  type        = string
  description = "OIDC Issuer URL from Kubernetes cluster"
}

variable "clinical_assets_bucket_arn" {
  type        = string
  description = "S3 bucket ARN for clinical assets"
}

variable "clinical_media_kms_key_arn" {
  type        = string
  description = "KMS key ARN for clinical media envelope encryption"
}

variable "runtime_secret_arns" {
  type        = list(string)
  description = "List of Secrets Manager ARNs accessible to runtime API"
}

variable "migrator_secret_arn" {
  type        = string
  description = "Secret Manager ARN for database migrator password"
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
