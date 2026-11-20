output "cluster_name" {
  value       = aws_eks_cluster.cluster.name
  description = "Name of the provisioned Kubernetes cluster"
}

output "cluster_endpoint" {
  value       = aws_eks_cluster.cluster.endpoint
  description = "Endpoint URL for Kubernetes API server"
}

output "cluster_certificate_authority_data" {
  value       = aws_eks_cluster.cluster.certificate_authority[0].data
  description = "Base64 encoded certificate authority data for cluster"
}

output "oidc_provider_arn" {
  value       = aws_iam_openid_connect_provider.oidc.arn
  description = "ARN of the OIDC provider for IRSA / Workload Identity"
}

output "oidc_issuer" {
  value       = aws_eks_cluster.cluster.identity[0].oidc[0].issuer
  description = "Issuer URL of the OIDC provider"
}
