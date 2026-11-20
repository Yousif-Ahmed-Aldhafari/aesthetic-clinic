variable "environment" {
  type        = string
  description = "Target deployment environment"
}

variable "kubernetes_version" {
  type        = string
  description = "Kubernetes control plane version"
  default     = "1.30"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnet IDs for cluster and node groups"
}

variable "cluster_security_group_id" {
  type        = string
  description = "Security group ID for cluster control plane"
}

variable "cluster_role_arn" {
  type        = string
  description = "IAM Role ARN for the EKS Cluster control plane"
}

variable "node_role_arn" {
  type        = string
  description = "IAM Role ARN for worker node instances"
}

variable "enable_public_api_endpoint" {
  type        = bool
  description = "Whether to enable public API server endpoint (false for production)"
  default     = false
}

variable "allowed_management_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to access cluster API endpoint when public"
  default     = []
}

variable "node_instance_types" {
  type        = list(string)
  description = "EC2 instance types for application worker nodes"
  default     = ["t3.xlarge"]
}

variable "node_desired_count" {
  type        = number
  description = "Desired number of worker nodes"
  default     = 3
}

variable "node_min_count" {
  type        = number
  description = "Minimum number of worker nodes"
  default     = 2
}

variable "node_max_count" {
  type        = number
  description = "Maximum number of worker nodes for auto-scaling"
  default     = 10
}

variable "node_disk_size_gb" {
  type        = number
  description = "Disk size in GB for node root volume"
  default     = 80
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
