# Snippd VPC Service Controls Perimeter

This Terraform config creates:

- `Snippd_Launch_Workstation` access level for the current public IP.
- `Snippd_Sovereign_Perimeter` service perimeter under access policy `890476823272`.
- Restricted services:
  - BigQuery
  - Vertex AI
  - Cloud Storage

Launch default is **dry-run only**:

```hcl
enforce_perimeter = false
```

That avoids locking out the current workstation while still letting Google report what would be blocked.

## Commands

```powershell
cd infra\vpc-sc
terraform init
terraform plan -out snippd-vpc-sc.tfplan
```

Only enforce after reviewing the plan:

```powershell
terraform apply snippd-vpc-sc.tfplan
```

To enforce later:

```powershell
terraform plan -var="enforce_perimeter=true" -out snippd-vpc-sc-enforce.tfplan
terraform apply snippd-vpc-sc-enforce.tfplan
```

## Safety

If `enforce_perimeter=true`, requests to restricted services from outside the perimeter will be blocked unless they satisfy the access level or explicit ingress/egress policies.
