output "notification_channel_id" {
  value = google_monitoring_notification_channel.pager.id
}

output "audit_sink_writer_identity" {
  value = google_logging_project_sink.audit_sink.writer_identity
}
