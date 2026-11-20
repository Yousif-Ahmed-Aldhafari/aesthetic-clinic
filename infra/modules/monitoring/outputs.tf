output "api_log_group_name" {
  value       = aws_cloudwatch_log_group.api_logs.name
  description = "CloudWatch log group name for API container stdout"
}

output "audit_log_group_name" {
  value       = aws_cloudwatch_log_group.audit_logs.name
  description = "CloudWatch log group name for immutable audit trail"
}

output "critical_alerts_topic_arn" {
  value       = aws_sns_topic.alerts_critical.arn
  description = "SNS topic ARN for critical incident routing"
}
