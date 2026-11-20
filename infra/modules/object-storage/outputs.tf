output "clinical_assets_bucket_name" {
  value       = aws_s3_bucket.clinical_assets.bucket
  description = "Bucket name for clinical media and documents"
}

output "clinical_assets_bucket_arn" {
  value       = aws_s3_bucket.clinical_assets.arn
  description = "Bucket ARN for clinical media and documents"
}

output "dr_backups_bucket_name" {
  value       = aws_s3_bucket.dr_backups.bucket
  description = "Bucket name for immutable disaster recovery backups"
}

output "dr_backups_bucket_arn" {
  value       = aws_s3_bucket.dr_backups.arn
  description = "Bucket ARN for immutable disaster recovery backups"
}
