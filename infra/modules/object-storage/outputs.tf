output "clinical_assets_bucket_name" {
  value = google_storage_bucket.clinical_assets.name
}

output "audit_archives_bucket_name" {
  value = google_storage_bucket.audit_archives.name
}

output "backup_vault_bucket_name" {
  value = google_storage_bucket.backup_vault.name
}
