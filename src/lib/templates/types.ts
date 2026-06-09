export type TemplateType =
  | "knowledge_page"
  | "sop"
  | "troubleshooting"
  | "runbook"
  | "protocol"
  | "task"
  | "ticket_reply"
  | "internal_note"
  | "resolution"
  | "onboarding"
  | "offboarding"
  | "postmortem"
  | "change";

export type TemplateStatus = "draft" | "published" | "archived";
export type TemplateVisibility = "internal" | "restricted" | "public_internal";

export interface TemplateChecklistItem {
  title: string;
  required?: boolean;
}

export interface TemplateProtocolStep {
  title: string;
  instructions?: string;
  required?: boolean;
}

export interface RegistryTemplate {
  id: string;
  name: string;
  type: TemplateType;
  category: string;
  description?: string;
  defaultTeam?: string;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  tags: string[];
  /** Markdown / structured body. For task it's description; for protocol it's purpose. */
  content?: string;
  checklist?: TemplateChecklistItem[];
  protocolSteps?: TemplateProtocolStep[];
  /** ticket_reply body, resolution outline, internal_note body */
  body?: string;
  /** Read-only built-in (from code seed). Cannot be deleted; can be duplicated. */
  builtin?: boolean;
  /** When type === 'knowledge_page' / 'task' / 'protocol' and this is a built-in,
   *  the original source id so legacy pickers can still resolve. */
  sourceId?: string;
  usageCount: number;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateState {
  /** Only user-managed custom templates persist here. Built-ins are merged at read time. */
  custom: RegistryTemplate[];
  /** Tracks usage count overrides for built-ins (since builtins aren't stored). */
  builtinUsage: Record<string, number>;
  /** IDs of built-ins the user has hidden/archived locally. */
  archivedBuiltinIds: string[];
}

export const TEMPLATE_TYPE_LABEL: Record<TemplateType, string> = {
  knowledge_page: "Knowledge Page",
  sop: "SOP",
  troubleshooting: "Troubleshooting",
  runbook: "Runbook",
  protocol: "Protocol",
  task: "Task",
  ticket_reply: "Ticket Reply",
  internal_note: "Internal Note",
  resolution: "Resolution",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  postmortem: "Postmortem",
  change: "Change",
};
