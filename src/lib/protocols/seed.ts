import type { ProtocolState, ProtocolTemplate, ProtocolRun, ProtocolStep } from "./types";

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

let n = 0;
const id = (p: string) => `${p}_${++n}_${Math.random().toString(36).slice(2, 7)}`;

function steps(items: Array<Partial<ProtocolStep> & { title: string }>): ProtocolStep[] {
  return items.map((s) => ({
    id: id("pst"),
    title: s.title,
    instructions: s.instructions ?? "",
    required: s.required ?? true,
    notesAllowed: s.notesAllowed ?? true,
    evidenceAllowed: s.evidenceAllowed ?? true,
    approvalCheckpoint: s.approvalCheckpoint ?? false,
    expectedResult: s.expectedResult,
    snippet: s.snippet,
  }));
}

function tmpl(t: Partial<ProtocolTemplate> & { title: string; category: string; steps: ProtocolStep[] }): ProtocolTemplate {
  return {
    id: id("ptpl"),
    title: t.title,
    category: t.category,
    description: t.description ?? "",
    purpose: t.purpose,
    scope: t.scope,
    preconditions: t.preconditions,
    assignedTeam: t.assignedTeam,
    estimatedMinutes: t.estimatedMinutes ?? 30,
    approvalRequired: t.approvalRequired ?? false,
    defaultApproverRole: t.defaultApproverRole,
    recurrence: t.recurrence ?? "none",
    requiredAssetIds: t.requiredAssetIds ?? [],
    requiredKnowledgeIds: t.requiredKnowledgeIds ?? [],
    tags: t.tags ?? [],
    visibility: t.visibility ?? "internal",
    steps: t.steps,
    archived: t.archived ?? false,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(7),
    lastRunAt: t.lastRunAt,
    deletedAt: t.deletedAt ?? null,
  };
}

export function buildProtocolSeed(): ProtocolState {
  n = 0;

  const templates: ProtocolTemplate[] = [
    tmpl({
      title: "Monthly Windows Server Patch Procedure",
      category: "Maintenance",
      description: "Standard monthly Windows Server patching cycle across production hosts.",
      assignedTeam: "Infrastructure",
      estimatedMinutes: 120,
      approvalRequired: true,
      defaultApproverRole: "it_admin",
      recurrence: "monthly",
      tags: ["windows", "patching", "maintenance"],
      lastRunAt: daysAgo(28),
      steps: steps([
        { title: "Announce maintenance window", instructions: "Post in IT-Announce channel and email impacted teams." },
        { title: "Snapshot Hyper-V VMs", instructions: "Create checkpoint for each production VM.", expectedResult: "Checkpoint visible in Hyper-V Manager" },
        { title: "Verify backup ran successfully", instructions: "Confirm last Veeam job completed without errors." },
        { title: "Install pending updates", instructions: "Use WSUS to deploy approved updates." , snippet: "Install-WindowsUpdate -AcceptAll -AutoReboot" },
        { title: "Reboot and verify services", instructions: "Reboot each host and verify role services come back online." },
        { title: "Smoke-test critical applications", instructions: "Login to AD, file shares, line-of-business apps.", approvalCheckpoint: true },
        { title: "Remove VM checkpoints", instructions: "Merge and remove temporary checkpoints once stable.", required: false },
        { title: "Document outcome", instructions: "Log completion notes and any exceptions." },
      ]),
    }),
    tmpl({
      title: "Backup Restore Verification",
      category: "Backup",
      description: "Quarterly verification that backup data is restorable.",
      assignedTeam: "Infrastructure",
      estimatedMinutes: 60,
      recurrence: "quarterly",
      tags: ["backup", "veeam", "verification"],
      steps: steps([
        { title: "Select random restore candidate", instructions: "Pick one VM and one file share at random." },
        { title: "Perform sandbox restore", instructions: "Restore to isolated network." },
        { title: "Verify integrity", instructions: "Boot VM / open file, validate checksums.", expectedResult: "Restore boots cleanly, files intact" },
        { title: "Document restore time", instructions: "Capture RTO actual vs target." },
      ]),
    }),
    tmpl({
      title: "New Employee Onboarding",
      category: "Identity",
      description: "End-to-end onboarding for new starters.",
      assignedTeam: "Service Desk",
      estimatedMinutes: 90,
      approvalRequired: true,
      defaultApproverRole: "sd_lead",
      tags: ["onboarding", "identity", "m365"],
      steps: steps([
        { title: "Create AD account", instructions: "Use standard naming convention." },
        { title: "Assign M365 license", instructions: "Apply correct license SKU." },
        { title: "Add to security groups", instructions: "Based on role mapping document." },
        { title: "Provision hardware", instructions: "Prepare laptop, peripherals." },
        { title: "Send welcome email", instructions: "Include first-login instructions and IT contacts." },
        { title: "Manager approval of access", instructions: "Confirm with manager before activation.", approvalCheckpoint: true },
      ]),
    }),
    tmpl({
      title: "Employee Offboarding",
      category: "Identity",
      description: "Secure offboarding workflow.",
      assignedTeam: "Service Desk",
      estimatedMinutes: 60,
      approvalRequired: true,
      defaultApproverRole: "it_admin",
      tags: ["offboarding", "identity", "security"],
      steps: steps([
        { title: "Disable AD account", instructions: "Disable rather than delete." },
        { title: "Revoke M365 sessions", instructions: "Sign-out all sessions in Entra." },
        { title: "Forward mailbox", instructions: "Forward to manager per policy." },
        { title: "Reclaim hardware", instructions: "Collect laptop and peripherals." },
        { title: "Document data handling", instructions: "Note OneDrive transfer / retention.", approvalCheckpoint: true },
      ]),
    }),
    tmpl({
      title: "Hyper-V Host Maintenance",
      category: "Maintenance",
      description: "Planned maintenance of Hyper-V host.",
      assignedTeam: "Infrastructure",
      estimatedMinutes: 90,
      tags: ["hyper-v", "maintenance"],
      steps: steps([
        { title: "Live-migrate VMs to peer host", instructions: "Verify all VMs running on other host." },
        { title: "Apply firmware/updates", instructions: "Vendor firmware and OS updates." },
        { title: "Reboot and validate cluster health", instructions: "Confirm cluster state and storage." },
        { title: "Migrate VMs back", instructions: "Rebalance workload across hosts." },
      ]),
    }),
    tmpl({
      title: "Firewall Rule Change",
      category: "Network",
      description: "Controlled change to firewall ruleset.",
      assignedTeam: "Network",
      estimatedMinutes: 30,
      approvalRequired: true,
      defaultApproverRole: "it_admin",
      tags: ["firewall", "network", "change"],
      steps: steps([
        { title: "Document business justification", instructions: "Reference change ticket." },
        { title: "Snapshot current ruleset", instructions: "Export config for rollback." },
        { title: "Apply rule change", instructions: "Implement during change window." , approvalCheckpoint: true },
        { title: "Validate connectivity", instructions: "Test from source → destination." },
        { title: "Update CMDB / documentation", instructions: "Record the new rule." },
      ]),
    }),
    tmpl({
      title: "Switch Replacement",
      category: "Network",
      description: "Hardware swap of access/core switch.",
      assignedTeam: "Network",
      estimatedMinutes: 120,
      tags: ["network", "hardware"],
      steps: steps([
        { title: "Schedule outage window", instructions: "Notify impacted users." },
        { title: "Backup running configuration", instructions: "Export config to repo." },
        { title: "Swap hardware", instructions: "Label cables, physical replacement." },
        { title: "Restore configuration", instructions: "Load saved config and validate VLANs." },
        { title: "Verify uplinks & PoE", instructions: "Check link state and PoE budget." },
      ]),
    }),
    tmpl({
      title: "Security Incident Checklist",
      category: "Security",
      description: "Initial response checklist for suspected security incident.",
      assignedTeam: "Security",
      estimatedMinutes: 45,
      approvalRequired: true,
      defaultApproverRole: "it_admin",
      tags: ["security", "incident"],
      steps: steps([
        { title: "Triage alert source", instructions: "Determine signal authenticity." },
        { title: "Contain affected hosts", instructions: "Isolate from network if needed." },
        { title: "Collect evidence", instructions: "Logs, memory, screenshots." },
        { title: "Notify leadership", instructions: "Per incident comms plan.", approvalCheckpoint: true },
        { title: "Open postmortem ticket", instructions: "Track remediation." },
      ]),
    }),
    tmpl({
      title: "Microsoft 365 User Provisioning",
      category: "Identity",
      description: "M365-specific provisioning for an existing AD user.",
      assignedTeam: "Service Desk",
      estimatedMinutes: 30,
      tags: ["m365", "identity"],
      steps: steps([
        { title: "Assign license", instructions: "Via Entra portal." },
        { title: "Enable MFA", instructions: "Enforce conditional access policy." },
        { title: "Add to distribution groups", instructions: "Per department." },
      ]),
    }),
    tmpl({
      title: "Quarterly Access Review",
      category: "Compliance",
      description: "Review of privileged group membership.",
      assignedTeam: "Security",
      estimatedMinutes: 90,
      recurrence: "quarterly",
      approvalRequired: true,
      tags: ["compliance", "access"],
      steps: steps([
        { title: "Export current memberships", instructions: "Run access export script." },
        { title: "Review with system owners", instructions: "Confirm continued business need." },
        { title: "Revoke unnecessary access", instructions: "Document removals.", approvalCheckpoint: true },
      ]),
    }),
    tmpl({
      title: "Daily IT Handover",
      category: "Operations",
      description: "End-of-day handover between shifts.",
      assignedTeam: "Service Desk",
      estimatedMinutes: 15,
      recurrence: "daily",
      tags: ["handover", "operations"],
      steps: steps([
        { title: "Review open critical tickets", instructions: "Walk through P1 / P2 queue." },
        { title: "Note ongoing changes", instructions: "Active maintenance windows." },
        { title: "Confirm on-call coverage", instructions: "Validate rota." },
      ]),
    }),
    tmpl({
      title: "Server Decommissioning",
      category: "Lifecycle",
      description: "Retire a server from production.",
      assignedTeam: "Infrastructure",
      estimatedMinutes: 90,
      approvalRequired: true,
      tags: ["decommission", "lifecycle"],
      steps: steps([
        { title: "Confirm no active dependencies", instructions: "Check CMDB & monitoring." },
        { title: "Take final backup", instructions: "Retain per policy." },
        { title: "Power down host", instructions: "Document shutdown.", approvalCheckpoint: true },
        { title: "Wipe storage", instructions: "Per data destruction policy." },
        { title: "Update CMDB to retired", instructions: "Close lifecycle." },
      ]),
    }),
    tmpl({
      title: "Incident Postmortem",
      category: "Operations",
      description: "Structured postmortem after incident resolution.",
      assignedTeam: "Service Desk",
      estimatedMinutes: 60,
      tags: ["postmortem", "incident"],
      steps: steps([
        { title: "Build incident timeline", instructions: "Pull events from monitoring & tickets." },
        { title: "Identify root cause", instructions: "Use 5-whys." },
        { title: "Document corrective actions", instructions: "Owner + due date." },
        { title: "Publish summary", instructions: "Share with stakeholders." },
      ]),
    }),
    tmpl({
      title: "Change Implementation Plan",
      category: "Change",
      description: "Generic change implementation runbook.",
      assignedTeam: "Infrastructure",
      estimatedMinutes: 60,
      approvalRequired: true,
      tags: ["change"],
      steps: steps([
        { title: "Pre-change checklist", instructions: "Validate prerequisites." },
        { title: "Apply change", instructions: "Per change ticket steps.", approvalCheckpoint: true },
        { title: "Post-change validation", instructions: "Verify success criteria." },
        { title: "Communicate completion", instructions: "Update requester." },
      ]),
    }),
  ];

  // Build a few runs across statuses
  const stamp = (i: number) => String(1000 + i).padStart(4, "0");
  let r = 0;
  const newRun = (t: ProtocolTemplate, overrides: Partial<ProtocolRun>): ProtocolRun => {
    r++;
    return {
      id: id("prun"),
      runNumber: `PR-${stamp(r)}`,
      templateId: t.id,
      templateTitle: t.title,
      status: "planned",
      team: t.assignedTeam,
      steps: t.steps.map((s) => ({ stepId: s.id, completed: false })),
      approvals: [],
      comments: [],
      createdAt: daysAgo(5),
      updatedAt: daysAgo(1),
      ...overrides,
    };
  };

  const runs: ProtocolRun[] = [
    newRun(templates[0], { status: "in_progress", assignedUser: "alice.it", startedAt: daysAgo(1), dueDate: daysAhead(2), steps: templates[0].steps.map((s, i) => ({ stepId: s.id, completed: i < 3, completedBy: i < 3 ? "alice.it" : undefined, completedAt: i < 3 ? daysAgo(1) : undefined })) }),
    newRun(templates[2], { status: "waiting_approval", assignedUser: "bob.admin", startedAt: daysAgo(2), dueDate: daysAhead(1) }),
    newRun(templates[5], { status: "planned", assignedUser: "carol.netops", dueDate: daysAhead(3) }),
    newRun(templates[1], { status: "completed", assignedUser: "alice.it", startedAt: daysAgo(10), completedAt: daysAgo(9), dueDate: daysAgo(8), finalSummary: "Restore verified successfully." }),
    newRun(templates[7], { status: "failed", assignedUser: "david.secops", startedAt: daysAgo(4), dueDate: daysAgo(3), finalSummary: "Containment incomplete — escalated." }),
    newRun(templates[10], { status: "in_progress", assignedUser: "bob.admin", startedAt: now(), dueDate: daysAhead(0) }),
    newRun(templates[0], { status: "planned", assignedUser: "alice.it", dueDate: daysAhead(7) }),
    newRun(templates[3], { status: "completed_with_issues", assignedUser: "bob.admin", startedAt: daysAgo(20), completedAt: daysAgo(19), finalSummary: "Completed; hardware return pending." }),
  ];

  return { templates, runs };
}
