variable "environment" {
  type        = string
  description = "Target deployment environment"
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
