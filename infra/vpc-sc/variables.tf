variable "project_id" {
  description = "Google Cloud project ID used by the provider."
  type        = string
  default     = "gen-lang-client-0848527535"
}

variable "project_number" {
  description = "Numeric Google Cloud project number protected by the perimeter."
  type        = string
  default     = "271214323449"
}

variable "access_policy_id" {
  description = "Access Context Manager policy ID."
  type        = string
  default     = "185059188280"
}

variable "perimeter_name" {
  description = "Short name for the service perimeter."
  type        = string
  default     = "Snippd_Sovereign_Perimeter"
}

variable "allowed_ip_cidrs" {
  description = "Public IP CIDR ranges allowed to access restricted services inside the perimeter."
  type        = list(string)
  default     = ["67.8.231.248/32"]
}

variable "allowed_members" {
  description = "Optional identities allowed by the access level. Example: user:founder@getsnippd.com"
  type        = list(string)
  default     = []
}

variable "restricted_services" {
  description = "Google APIs protected by the service perimeter."
  type        = list(string)
  default = [
    "bigquery.googleapis.com",
    "aiplatform.googleapis.com",
    "storage.googleapis.com",
  ]
}

variable "enforce_perimeter" {
  description = "When false, config is written to the dry-run spec only. Set true to enforce status."
  type        = bool
  default     = false
}
