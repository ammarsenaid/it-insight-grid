import type { RegistryTemplate, TemplateType } from "./types";
import { TEMPLATES as KB_TEMPLATES } from "@/lib/knowledge/templates";
import { TASK_TEMPLATES } from "@/lib/data/task-templates";

const NOW = "2024-01-01T00:00:00.000Z";

function base(partial: Partial<RegistryTemplate> & Pick<RegistryTemplate, "id" | "name" | "type" | "category">): RegistryTemplate {
  return {
    description: "",
    visibility: "internal",
    status: "published",
    tags: [],
    usageCount: 0,
    builtin: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

/** Category mapping for knowledge templates → registry type. */
function knowledgeTypeFor(name: string, category: string): TemplateType {
  const n = name.toLowerCase();
  if (n.includes("sop") || n.includes("operating procedure")) return "sop";
  if (n.includes("troubleshoot") || n.includes("how-to") || n.includes("how to")) return "troubleshooting";
  if (n.includes("runbook")) return "runbook";
  if (n.includes("postmortem") || n.includes("post-mortem")) return "postmortem";
  if (n.includes("change")) return "change";
  if (n.includes("onboarding")) return "onboarding";
  if (category.toLowerCase() === "incident") return "postmortem";
  return "knowledge_page";
}

/** Build built-in template list. Pure — safe to call during SSR. */
export function buildBuiltinTemplates(): RegistryTemplate[] {
  const out: RegistryTemplate[] = [];

  // Knowledge templates
  for (const t of KB_TEMPLATES) {
    out.push(base({
      id: `reg_kb_${t.id}`,
      sourceId: t.id,
      name: t.name,
      type: knowledgeTypeFor(t.name, t.category),
      category: t.category,
      description: t.description,
      content: t.content,
      tags: ["knowledge"],
    }));
  }

  // Task templates
  for (const t of TASK_TEMPLATES) {
    out.push(base({
      id: `reg_task_${t.id}`,
      sourceId: t.id,
      name: t.name,
      type: "task",
      category: t.category,
      description: t.description,
      defaultTeam: t.defaultTeam,
      tags: t.tags ?? [],
      checklist: t.checklist ?? [],
    }));
  }

  // Ticket reply templates (seeded list per spec).
  const replies: Array<[string, string, string]> = [
    ["Request More Information", "Information", "Hi {{requester}},\n\nThanks for reaching out. Could you provide the following so we can investigate further?\n\n- \n- \n\nThanks,\n{{agent}}"],
    ["Ticket Assigned", "Status", "Hi {{requester}},\n\nYour ticket has been assigned to {{assignee}}. We'll get back to you shortly with an update."],
    ["Work in Progress", "Status", "Hi {{requester}},\n\nWe're actively working on this. Current status: {{status}}.\n\nNext update by: {{eta}}."],
    ["Waiting for User", "Status", "Hi {{requester}},\n\nWe need additional input from you to continue. Please respond at your earliest convenience."],
    ["Resolved", "Resolution", "Hi {{requester}},\n\nThis ticket has been resolved. Summary:\n\n{{resolution_summary}}\n\nIf the issue returns please reopen this ticket within 7 days."],
    ["Known Issue", "Information", "Hi {{requester}},\n\nThis is a known issue. Tracking under {{problem_ref}}. Workaround:\n\n{{workaround}}"],
    ["Planned Maintenance", "Information", "Hi {{requester}},\n\nThis is related to planned maintenance scheduled for {{window}}. No action required on your side."],
    ["Password Reset Instructions", "Self-service", "Hi {{requester}},\n\nPlease reset your password using the self-service portal at {{portal_url}}. If MFA is required, use your registered device."],
    ["Access Request Approved", "Access", "Hi {{requester}},\n\nYour access request has been approved. Access typically takes 15 minutes to propagate."],
    ["Access Request Rejected", "Access", "Hi {{requester}},\n\nUnfortunately your access request was not approved. Reason: {{reason}}.\n\nPlease contact your manager if you need to escalate."],
  ];
  for (const [name, category, body] of replies) {
    out.push(base({
      id: `reg_reply_${name.toLowerCase().replace(/\W+/g, "_")}`,
      name,
      type: "ticket_reply",
      category,
      body,
      tags: ["service-desk"],
    }));
  }

  // Internal notes
  const notes: Array<[string, string]> = [
    ["Triage Note", "Initial triage:\n- Severity: \n- Affected users: \n- Suspected cause: "],
    ["Handover", "Handover to next shift:\n- Status: \n- Actions taken: \n- Pending actions: \n- Contacts: "],
    ["Escalation", "Escalating to {{team}} because {{reason}}."],
  ];
  for (const [name, body] of notes) {
    out.push(base({
      id: `reg_note_${name.toLowerCase().replace(/\W+/g, "_")}`,
      name,
      type: "internal_note",
      category: "Service Desk",
      body,
      tags: ["internal"],
    }));
  }

  // Resolution outlines
  const resolutions: Array<[string, string]> = [
    ["Standard Resolution", "## Summary\n\n## Root cause\n\n## Resolution steps\n\n1.\n2.\n\n## Verification\n\n- [ ] Service responding\n- [ ] User confirmed"],
    ["Known Error", "## Symptom\n\n## Known error reference\n\n## Workaround applied\n\n## Permanent fix tracked under"],
    ["No Fault Found", "## Investigation\n\n## Tests performed\n\n## Conclusion\n\nNo fault could be reproduced. Closing pending user confirmation."],
  ];
  for (const [name, body] of resolutions) {
    out.push(base({
      id: `reg_res_${name.toLowerCase().replace(/\W+/g, "_")}`,
      name,
      type: "resolution",
      category: "Service Desk",
      body,
      tags: ["resolution"],
    }));
  }

  return out;
}
