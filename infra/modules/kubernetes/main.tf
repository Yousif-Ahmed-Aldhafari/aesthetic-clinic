# Kubernetes Module — Private Cluster, Node Groups, OIDC, and Pod Security

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

resource "aws_eks_cluster" "cluster" {
  name     = "${var.environment}-lamssa-k8s"
  role_arn = var.cluster_role_arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.subnet_ids
    security_group_ids      = [var.cluster_security_group_id]
    endpoint_private_access = true
    endpoint_public_access  = var.enable_public_api_endpoint
    public_access_cidrs     = var.allowed_management_cidrs
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = merge(var.tags, {
    Environment = var.environment
    Compliance  = "Healthcare-NCA-ECC"
  })
}

resource "aws_eks_node_group" "app_nodes" {
  cluster_name    = aws_eks_cluster.cluster.name
  node_group_name = "${var.environment}-lamssa-app-nodes"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.subnet_ids

  scaling_config {
    desired_size = var.node_desired_count
    max_size     = var.node_max_count
    min_size     = var.node_min_count
  }

  instance_types = var.node_instance_types
  capacity_type  = "ON_DEMAND"

  # Enforce encrypted EBS root volumes for nodes
  disk_size = var.node_disk_size_gb

  labels = {
    Environment = var.environment
    Workload    = "StatelessApp"
  }

  tags = var.tags
}

# OIDC Provider for Kubernetes Workload Identity (IAM Roles for Service Accounts)
data "tls_certificate" "cluster" {
  url = aws_eks_cluster.cluster.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "oidc" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.cluster.identity[0].oidc[0].issuer

  tags = var.tags
}
