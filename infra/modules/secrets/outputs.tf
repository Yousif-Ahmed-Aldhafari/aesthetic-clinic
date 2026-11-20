output "app_db_password_secret_arn" {
  value       = aws_secretsmanager_secret.app_db_password.arn
  description = "Secret ARN for app database password"
}

output "migrator_db_password_secret_arn" {
  value       = aws_secretsmanager_secret.migrator_db_password.arn
  description = "Secret ARN for migrator database password"
}

output "auth_csrf_secret_arn" {
  value       = aws_secretsmanager_secret.auth_csrf_secret.arn
  description = "Secret ARN for CSRF secret"
}

output "mfa_encryption_key_arn" {
  value       = aws_secretsmanager_secret.mfa_encryption_key.arn
  description = "Secret ARN for MFA encryption key"
}

output "clinical_media_key_arn" {
  value       = aws_secretsmanager_secret.clinical_media_key.arn
  description = "Secret ARN for clinical media encryption key"
}

output "metrics_secret_key_arn" {
  value       = aws_secretsmanager_secret.metrics_secret_key.arn
  description = "Secret ARN for metrics secret key"
}
