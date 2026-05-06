output "perimeter_name" {
  value = google_access_context_manager_service_perimeter.snippd_perimeter.name
}

output "access_level_name" {
  value = google_access_context_manager_access_level.launch_workstation.name
}

output "dry_run_only" {
  value = !var.enforce_perimeter
}
