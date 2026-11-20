region             = "me-central2"
vpc_cidr           = "10.200.0.0/16"
availability_zones = ["me-central2a", "me-central2b", "me-central2c"]
db_instance_class  = "db.r6g.xlarge"
tags = {
  Organization = "Lamssa-Healthcare"
  Jurisdiction = "Saudi-Arabia"
  DataTier     = "Production-PHI"
}
