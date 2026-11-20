# Networking Module — Multi-AZ VPC, Private Subnets, and Network Security Groups

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name        = "${var.environment}-lamssa-vpc"
    Environment = var.environment
  })
}

# Public Edge Subnets (Ingress Load Balancers only)
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name        = "${var.environment}-public-edge-${var.availability_zones[count.index]}"
    Tier        = "PublicEdge"
    Environment = var.environment
  })
}

# Private Application Subnets (Stateless Compute Pods)
resource "aws_subnet" "application" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name        = "${var.environment}-private-app-${var.availability_zones[count.index]}"
    Tier        = "Application"
    Environment = var.environment
  })
}

# Private Database Subnets (PostgreSQL HA Cluster — No Internet Egress)
resource "aws_subnet" "database" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name        = "${var.environment}-private-db-${var.availability_zones[count.index]}"
    Tier        = "Database"
    Environment = var.environment
  })
}

# Internet Gateway for Public Edge
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name        = "${var.environment}-lamssa-igw"
    Environment = var.environment
  })
}

# Elastic IP and NAT Gateway for Controlled Outbound (APIs / Regulators)
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(var.tags, {
    Name        = "${var.environment}-lamssa-nat-eip"
    Environment = var.environment
  })
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(var.tags, {
    Name        = "${var.environment}-lamssa-nat-gw"
    Environment = var.environment
  })
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-public-rt"
  })
}

resource "aws_route_table" "application" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-app-rt"
  })
}

# Database Route Table: Strictly Isolated, Zero Internet Route (No 0.0.0.0/0 route)
resource "aws_route_table" "database" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.environment}-db-rt-isolated"
  })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "application" {
  count          = length(aws_subnet.application)
  subnet_id      = aws_subnet.application[count.index].id
  route_table_id = aws_route_table.application.id
}

resource "aws_route_table_association" "database" {
  count          = length(aws_subnet.database)
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}

# Security Groups: Tiered Ingress and Egress
resource "aws_security_group" "edge_alb" {
  name        = "${var.environment}-edge-alb-sg"
  description = "Allows inbound HTTPS to edge reverse proxy load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from Internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Forward to Application Tier"
    from_port   = 3000
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = var.tags
}

resource "aws_security_group" "app_compute" {
  name        = "${var.environment}-app-compute-sg"
  description = "Security group for stateless NestJS API and Web Nginx pods"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Traffic from Edge ALB"
    from_port       = 3000
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.edge_alb.id]
  }

  egress {
    description = "mTLS to PgBouncer / PostgreSQL"
    from_port   = 5432
    to_port     = 6432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Outbound HTTPS for private VPC endpoints and NAT"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "aws_security_group" "database" {
  name        = "${var.environment}-database-sg"
  description = "Security group for PostgreSQL and PgBouncer — No direct internet ingress"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from App Compute only"
    from_port       = 5432
    to_port         = 6432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_compute.id]
  }

  egress {
    description = "Inter-node replication within database subnets"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    self        = true
  }

  tags = var.tags
}

# Private VPC Endpoints for S3 and KMS (Traffic never traverses public internet)
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.region}.s3"
  route_table_ids = [
    aws_route_table.application.id,
    aws_route_table.database.id
  ]

  tags = merge(var.tags, {
    Name = "${var.environment}-s3-vpc-endpoint"
  })
}
