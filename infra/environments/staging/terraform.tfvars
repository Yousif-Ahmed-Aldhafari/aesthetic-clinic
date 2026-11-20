region             = "me-central2"
vpc_cidr           = "10.100.0.0/16"
availability_zones = ["me-central2a", "me-central2b"]
db_instance_class  = "db.t4g.large"
tags = {
  Organization = "Lamssa-Healthcare"
  Jurisdiction = "Saudi-Arabia"
  DataTier     = "Staging-Synthetic"
}
