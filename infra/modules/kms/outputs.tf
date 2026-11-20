output "key_ring_id" {
  value = google_kms_key_ring.main.id
}

output "database_kek_name" {
  value = google_kms_crypto_key.database_kek.id
}

output "clinical_assets_kek_name" {
  value = google_kms_crypto_key.clinical_assets_kek.id
}

output "secrets_kek_name" {
  value = google_kms_crypto_key.secrets_kek.id
}
