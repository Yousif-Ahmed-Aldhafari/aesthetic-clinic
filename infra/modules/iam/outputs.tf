output "api_runtime_role_arn" {
  value       = aws_iam_role.api_runtime.arn
  description = "IAM Role ARN for API runtime service account"
}

output "migration_runner_role_arn" {
  value       = aws_iam_role.migration_runner.arn
  description = "IAM Role ARN for database migration service account"
}
