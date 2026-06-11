/**
 * Row mappers — convert snake_case Postgres rows into the camelCase DTOs
 * defined in ./types. Centralised so the rest of the data layer doesn't
 * sprinkle field-name conversions everywhere.
 */
import type {
  CatalogItem,
  NotificationRow,
  Ticket,
  TicketAssignmentEvent,
  TicketAttachment,
  TicketCannedResponse,
  TicketCategory,
  TicketComment,
  TicketMailboxConfig,
  TicketPriorityConfig,
  TicketRoutingRule,
  TicketSlaPolicy,
  TicketStatusEvent,
  CatalogFieldSchema,
} from "./types";

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v == null ? fallback : String(v);
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : v == null ? null : String(v);
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" ? v : v == null ? fallback : Number(v);
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" ? v : v == null ? null : Number(v);
const bool = (v: unknown, fallback = false): boolean =>
  typeof v === "boolean" ? v : v == null ? fallback : Boolean(v);
const obj = <T = Record<string, unknown>>(v: unknown, fallback: T): T =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback;
const arr = <T>(v: unknown, mapper: (x: unknown) => T, fallback: T[] = []): T[] =>
  Array.isArray(v) ? v.map(mapper) : fallback;

export function mapCatalogItem(row: Row): CatalogItem {
  const fields = arr<CatalogFieldSchema>(row.fields_schema, (x) => {
    const f = obj(x, {} as Record<string, unknown>);
    return {
      key: str(f.key),
      label: str(f.label, str(f.key)),
      type: (str(f.type, "text") as CatalogFieldSchema["type"]) || "text",
      required: bool(f.required),
      options: Array.isArray(f.options) ? (f.options as unknown[]).map(String) : undefined,
      placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
    };
  });
  return {
    id: str(row.id),
    name: str(row.name),
    category: str(row.category),
    description: str(row.description),
    icon: str(row.icon, "ShoppingBag"),
    defaultPriority: str(row.default_priority, "normal") as CatalogItem["defaultPriority"],
    defaultTeam: strOrNull(row.default_team),
    estimatedTime: strOrNull(row.estimated_time),
    visibility: str(row.visibility, "internal") as CatalogItem["visibility"],
    fieldsSchema: fields,
    status: str(row.status, "draft") as CatalogItem["status"],
    createdBy: strOrNull(row.created_by),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapTicket(row: Row): Ticket {
  return {
    id: str(row.id),
    ticketNumber: str(row.ticket_number),
    requesterId: str(row.requester_id),
    catalogItemId: strOrNull(row.catalog_item_id),
    subject: str(row.subject),
    description: str(row.description),
    type: str(row.type, "request") as Ticket["type"],
    category: strOrNull(row.category),
    subcategory: strOrNull(row.subcategory),
    priority: str(row.priority, "normal") as Ticket["priority"],
    status: str(row.status, "open") as Ticket["status"],
    source: str(row.source, "portal") as Ticket["source"],
    sourceEmail: strOrNull(row.source_email),
    affectedService: strOrNull(row.affected_service),
    assignedTeam: strOrNull(row.assigned_team),
    assigneeId: strOrNull(row.assignee_id),
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [],
    catalogValues: obj(row.catalog_values, {}),
    openedAt: str(row.opened_at),
    resolvedAt: strOrNull(row.resolved_at),
    closedAt: strOrNull(row.closed_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapTicketComment(row: Row): TicketComment {
  return {
    id: str(row.id),
    ticketId: str(row.ticket_id),
    authorId: strOrNull(row.author_id),
    body: str(row.body),
    internal: bool(row.internal),
    createdAt: str(row.created_at),
  };
}

export function mapStatusEvent(row: Row): TicketStatusEvent {
  return {
    id: str(row.id),
    ticketId: str(row.ticket_id),
    fromStatus: (row.from_status == null
      ? null
      : str(row.from_status)) as TicketStatusEvent["fromStatus"],
    toStatus: str(row.to_status) as TicketStatusEvent["toStatus"],
    changedBy: strOrNull(row.changed_by),
    reason: strOrNull(row.reason),
    changedAt: str(row.changed_at),
  };
}

export function mapAssignmentEvent(row: Row): TicketAssignmentEvent {
  return {
    id: str(row.id),
    ticketId: str(row.ticket_id),
    fromTeam: strOrNull(row.from_team),
    toTeam: strOrNull(row.to_team),
    fromAssigneeId: strOrNull(row.from_assignee_id),
    toAssigneeId: strOrNull(row.to_assignee_id),
    changedBy: strOrNull(row.changed_by),
    reason: strOrNull(row.reason),
    changedAt: str(row.changed_at),
  };
}

export function mapAttachment(row: Row): TicketAttachment {
  return {
    id: str(row.id),
    ticketId: str(row.ticket_id),
    commentId: strOrNull(row.comment_id),
    uploadedBy: strOrNull(row.uploaded_by),
    storagePath: str(row.storage_path),
    fileName: str(row.file_name),
    mimeType: str(row.mime_type, "application/octet-stream"),
    sizeBytes: num(row.size_bytes),
    visibility: str(row.visibility, "public") as TicketAttachment["visibility"],
    createdAt: str(row.created_at),
  };
}

export function mapNotification(row: Row): NotificationRow {
  return {
    id: str(row.id),
    userId: str(row.user_id),
    ticketId: strOrNull(row.ticket_id),
    kind: str(row.kind) as NotificationRow["kind"],
    title: str(row.title),
    body: str(row.body),
    payload: obj(row.payload, {}),
    readAt: strOrNull(row.read_at),
    createdAt: str(row.created_at),
  };
}

export function mapCategory(row: Row): TicketCategory {
  return {
    id: str(row.id),
    key: str(row.key),
    name: str(row.name),
    description: str(row.description),
    parentId: strOrNull(row.parent_id),
    sortOrder: num(row.sort_order),
    isActive: bool(row.is_active, true),
  };
}

export function mapPriorityConfig(row: Row): TicketPriorityConfig {
  return {
    id: str(row.id),
    key: str(row.key) as TicketPriorityConfig["key"],
    name: str(row.name),
    color: str(row.color, "#64748b"),
    responseTargetMinutes: numOrNull(row.response_target_minutes),
    resolutionTargetMinutes: numOrNull(row.resolution_target_minutes),
    sortOrder: num(row.sort_order),
    isActive: bool(row.is_active, true),
  };
}

export function mapSlaPolicy(row: Row): TicketSlaPolicy {
  return {
    id: str(row.id),
    name: str(row.name),
    description: str(row.description),
    priorityKey: str(row.priority_key) as TicketSlaPolicy["priorityKey"],
    responseMinutes: num(row.response_minutes),
    resolutionMinutes: num(row.resolution_minutes),
    businessHoursOnly: bool(row.business_hours_only),
    isActive: bool(row.is_active, true),
  };
}

export function mapRoutingRule(row: Row): TicketRoutingRule {
  return {
    id: str(row.id),
    name: str(row.name),
    description: str(row.description),
    matchWhen: obj(row.match_when, {}),
    action: obj(row.action, {}),
    priorityOrder: num(row.priority_order),
    isActive: bool(row.is_active, true),
  };
}

export function mapCannedResponse(row: Row): TicketCannedResponse {
  return {
    id: str(row.id),
    shortcut: str(row.shortcut),
    title: str(row.title),
    body: str(row.body),
    isInternal: bool(row.is_internal),
    createdBy: strOrNull(row.created_by),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapMailboxConfig(row: Row): TicketMailboxConfig {
  return {
    id: str(row.id),
    name: str(row.name),
    inboundAddress: str(row.inbound_address),
    outboundFrom: strOrNull(row.outbound_from),
    replyTo: strOrNull(row.reply_to),
    defaultCategory: strOrNull(row.default_category),
    defaultPriority: str(row.default_priority, "normal") as TicketMailboxConfig["defaultPriority"],
    defaultTeam: strOrNull(row.default_team),
    isActive: bool(row.is_active, true),
  };
}
