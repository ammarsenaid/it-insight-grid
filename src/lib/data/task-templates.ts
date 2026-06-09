import type { TaskTemplate } from "./types";

// Frontend-only built-in task templates (Phase 2).
// /admin/templates registry comes in Phase 3.
export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "tpl_patch_server",
    name: "Patch Server",
    category: "Patching",
    priority: "high",
    defaultTeam: "Infrastructure",
    description: "Apply approved OS and security patches to a target server.",
    tags: ["patching", "maintenance"],
    checklist: [
      { title: "Confirm maintenance window", required: true },
      { title: "Take pre-patch snapshot or backup", required: true },
      { title: "Apply approved updates", required: true },
      { title: "Reboot and validate services", required: true },
      { title: "Document patch level", required: false },
    ],
  },
  {
    id: "tpl_verify_backup",
    name: "Verify Backup Restore",
    category: "Backup",
    priority: "high",
    defaultTeam: "Infrastructure",
    description: "Validate that backups can be restored end-to-end.",
    checklist: [
      { title: "Select latest backup set", required: true },
      { title: "Restore to test target", required: true },
      { title: "Validate file/DB integrity", required: true },
      { title: "Record outcome in runbook", required: false },
    ],
    recurring: { freq: "monthly", interval: 1 },
  },
  {
    id: "tpl_create_user",
    name: "Create User Account",
    category: "Onboarding",
    priority: "normal",
    defaultTeam: "Service Desk",
    checklist: [
      { title: "Create AD / IdP account", required: true },
      { title: "Add to baseline groups", required: true },
      { title: "Create mailbox / aliases", required: true },
      { title: "Send welcome email", required: false },
    ],
  },
  {
    id: "tpl_remove_access",
    name: "Remove User Access",
    category: "Security",
    priority: "high",
    defaultTeam: "Service Desk",
    checklist: [
      { title: "Disable account", required: true },
      { title: "Remove from groups", required: true },
      { title: "Revoke SSO / VPN sessions", required: true },
      { title: "Forward mailbox / set OOO", required: false },
    ],
  },
  {
    id: "tpl_replace_hw",
    name: "Replace Hardware",
    category: "Hardware",
    priority: "normal",
    defaultTeam: "Service Desk",
    checklist: [
      { title: "Procure / pull replacement", required: true },
      { title: "Image and configure", required: true },
      { title: "Migrate user data", required: true },
      { title: "Decommission old asset in CMDB", required: true },
    ],
  },
  {
    id: "tpl_fw_rule",
    name: "Update Firewall Rule",
    category: "Network",
    priority: "high",
    defaultTeam: "Network",
    checklist: [
      { title: "Validate change request", required: true },
      { title: "Apply rule in staging", required: false },
      { title: "Apply rule in production", required: true },
      { title: "Test traffic flow", required: true },
    ],
  },
  {
    id: "tpl_sec_alert",
    name: "Review Security Alert",
    category: "Security",
    priority: "critical",
    defaultTeam: "Security",
    checklist: [
      { title: "Triage source and severity", required: true },
      { title: "Contain affected host", required: true },
      { title: "Investigate scope", required: true },
      { title: "Document IOCs", required: false },
    ],
  },
  {
    id: "tpl_monitor",
    name: "Validate Monitoring",
    category: "Maintenance",
    priority: "normal",
    defaultTeam: "Infrastructure",
    checklist: [
      { title: "Verify host & service checks", required: true },
      { title: "Confirm alert routing", required: true },
      { title: "Test paging chain", required: false },
    ],
  },
  {
    id: "tpl_doc_update",
    name: "Update Documentation",
    category: "Documentation",
    priority: "low",
    defaultTeam: "Infrastructure",
    checklist: [
      { title: "Review existing page", required: true },
      { title: "Apply edits", required: true },
      { title: "Submit for review", required: false },
    ],
  },
  {
    id: "tpl_monthly_maint",
    name: "Monthly Maintenance",
    category: "Maintenance",
    priority: "normal",
    defaultTeam: "Infrastructure",
    recurring: { freq: "monthly", interval: 1 },
    checklist: [
      { title: "Review patching status", required: true },
      { title: "Review backup health", required: true },
      { title: "Review capacity dashboards", required: true },
      { title: "Update CMDB drift", required: false },
    ],
  },
  {
    id: "tpl_employee_setup",
    name: "New Employee Setup",
    category: "Onboarding",
    priority: "high",
    defaultTeam: "Service Desk",
    checklist: [
      { title: "Provision laptop", required: true },
      { title: "Create accounts", required: true },
      { title: "Schedule day-1 walkthrough", required: false },
      { title: "Issue access badges", required: true },
    ],
  },
  {
    id: "tpl_offboarding",
    name: "Employee Offboarding",
    category: "Security",
    priority: "high",
    defaultTeam: "Service Desk",
    checklist: [
      { title: "Disable accounts", required: true },
      { title: "Collect hardware", required: true },
      { title: "Revoke building access", required: true },
      { title: "Archive mailbox", required: false },
    ],
  },
];

export function getTaskTemplate(id: string) {
  return TASK_TEMPLATES.find((t) => t.id === id) ?? null;
}
