variable "environment" {
  type        = string
  description = "Target deployment environment"
}

variable "database_subnet_ids" {
  type        = list(string)
  description = "Isolated private database subnet IDs"
}

variable "database_security_group_id" {
  type        = string
  description = "Security group ID restricting access to app compute only"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS Customer Managed Key ARN for database storage encryption"
}

variable "instance_class" {
  type        = string
  description = "PostgreSQL DB instance class"
  default     = "db.r6g.xlarge"
}

variable "allocated_storage_gb" {
  type        = number
  description = "Initial allocated storage in GB"
  default     = 100
}

variable "max_allocated_storage_gb" {
  type        = number
  description = "Maximum storage auto-scaling limit in GB"
  default     = 1000
}

variable "enable_multi_az" {
  type        = bool
  description = "Enable Multi-AZ synchronous standby replication"
  default     = true
}

variable "backup_retention_days" {
  type        = number
  description = "Days of automated backup and PITR retention"
  default     = 30
}

variable "admin_password_secret_ref" {
  type        = string
  description = "Admin password reference from secrets store"
  sensitive   = true
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
