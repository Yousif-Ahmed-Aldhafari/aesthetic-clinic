# Monitoring Module — Telemetry Log Groups, Metrics Alarms, and Notification Topics

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/lamssa/${var.environment}/api"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "audit_logs" {
  name              = "/lamssa/${var.environment}/audit-trail"
  retention_in_days = 3650 # 10 years for statutory compliance
  kms_key_id        = var.kms_key_arn

  tags = var.tags
}

resource "aws_sns_topic" "alerts_critical" {
  name              = "${var.environment}-lamssa-critical-alerts"
  kms_master_key_id = var.kms_key_arn

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "high_5xx_errors" {
  alarm_name          = "${var.environment}-high-5xx-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5XXError"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Triggered when 5xx internal server errors exceed threshold"
  alarm_actions       = [aws_sns_topic.alerts_critical.arn]

  tags = var.tags
}
