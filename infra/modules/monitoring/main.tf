# Google Cloud Monitoring Module — Alert Policies & Audit Log Routing

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

resource "google_monitoring_notification_channel" "pager" {
  display_name = "Lamssa On-Call Alert Notification (${var.environment})"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# Alert on High HTTP 5xx Error Rate
resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "${var.environment}-lamssa-high-5xx-rate"
  combiner     = "OR"

  conditions {
    display_name = "HTTP 5xx error rate > 1%"
    condition_threshold {
      filter          = "resource.type = \"k8s_container\" AND metric.type = \"logging.googleapis.com/user/http_5xx_count\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.01
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.pager.name]
}

# Audit Log Sink routing to Audit Storage Bucket
resource "google_logging_project_sink" "audit_sink" {
  name        = "${var.environment}-lamssa-audit-sink"
  destination = "storage.googleapis.com/${var.audit_bucket_name}"
  filter      = "logName:\"logs/cloudaudit.googleapis.com\""

  unique_writer_identity = true
}
