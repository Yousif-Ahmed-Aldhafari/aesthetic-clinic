output "database_kms_key_arn" {
  value       = aws_kms_key.database.arn
  description = "ARN of KMS key for PostgreSQL database storage encryption"
}

output "clinical_media_kms_key_arn" {
  value       = aws_kms_key.clinical_media.arn
  description = "ARN of KMS key for clinical media envelope encryption"
}

output "object_storage_kms_key_arn" {
  value       = aws_kms_key.object_storage.arn
  description = "ARN of KMS key for S3 bucket server-side encryption"
}
