locals {
  access_policy_name  = "accessPolicies/${var.access_policy_id}"
  perimeter_full_name = "${local.access_policy_name}/servicePerimeters/${var.perimeter_name}"
  project_resource    = "projects/${var.project_number}"
}

resource "google_access_context_manager_access_level" "launch_workstation" {
  parent = local.access_policy_name
  name   = "${local.access_policy_name}/accessLevels/Snippd_Launch_Workstation"
  title  = "Snippd Launch Workstation"

  basic {
    conditions {
      ip_subnetworks = var.allowed_ip_cidrs
      members        = var.allowed_members
    }
  }
}

resource "google_access_context_manager_service_perimeter" "snippd_perimeter" {
  parent = local.access_policy_name
  name   = local.perimeter_full_name
  title  = "Snippd Sovereign Perimeter"

  perimeter_type = "PERIMETER_TYPE_REGULAR"

  # Dry-run mode is the launch default. It lets Google report what would be
  # blocked before we enforce the perimeter.
  use_explicit_dry_run_spec = !var.enforce_perimeter

  spec {
    resources           = [local.project_resource]
    restricted_services = var.restricted_services
    access_levels       = [google_access_context_manager_access_level.launch_workstation.name]
  }

  dynamic "status" {
    for_each = var.enforce_perimeter ? [1] : []
    content {
      resources           = [local.project_resource]
      restricted_services = var.restricted_services
      access_levels       = [google_access_context_manager_access_level.launch_workstation.name]
    }
  }
}
