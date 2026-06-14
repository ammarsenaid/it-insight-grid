/**
 * Service Desk DTOs — shaped exactly like the pending Supabase tables
 * (see supabase/pending/20260611*.sql). camelCase here; we map from the
 * snake_case Postgres columns in the data-access layer.
 *
 * These types are the contract between the frontend and the database.
 * They DO NOT match the legacy src/lib/data/types.ts shapes (which
 * include client-only helpers like `sla`, `watchers`, etc.); routes
 * that move to the backend should switch over to these.
 */

export type TicketPriority = "low" | "normal" | "high" | "critical";
export type TicketStatus =
  | "open"
  | "in_progress"
  | "on_hold"
  | "resolved"
  | "closed"
  | "reopened";
export type TicketType = "request" | "incident" | "problem" | "change";
export type TicketSource = "portal" | "service_catalog" | "email" | "api";

export type CatalogItemStatus = "draft" | "published" | "archived";
export type CatalogItemVisibility = "internal" | "restricted";

export interface CatalogFieldSchema {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  defaultPriority: TicketPriority;
  defaultTeam: string | null;
  estimatedTime: string | null;
  visibility: CatalogItemVisibility;
  fieldsSchema: CatalogFieldSchema[];
  status: CatalogItemStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  requesterId: string;
  catalogItemId: string | null;
  subject: string;
  description: string;
  type: TicketType;
  category: string | null;
  subcategory: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  source: TicketSource;
  sourceEmail: string | null;
  affectedService: string | null;
  assignedTeam: string | null;
  assigneeId: string | null;
  tags: string[];
  catalogValues: Record<string, unknown>;
  openedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string | null;
  body: string;
  internal: boolean;
  createdAt: string;
}

export interface TicketStatusEvent {
  id: string;
  ticketId: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedBy: string | null;
  reason: string | null;
  changedAt: string;
}

export interface TicketAssignmentEvent {
  id: string;
  ticketId: string;
  fromTeam: string | null;
  toTeam: string | null;
  fromAssigneeId: string | null;
  toAssigneeId: string | null;
  changedBy: string | null;
  reason: string | null;
  changedAt: string;
}

export interface TicketAuditEntry {
  id: string;
  ticketId: string | null;
  actorId: string | null;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  commentId: string | null;
  uploadedBy: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: "public" | "internal";
  createdAt: string;
}

export type NotificationKind =
  | "ticket.created"
  | "ticket.reply"
  | "ticket.status"
  | "ticket.assigned";

export interface NotificationRow {
  id: string;
  userId: string;
  ticketId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface TicketCategory {
  id: string;
  key: string;
  name: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TicketPriorityConfig {
  id: string;
  key: TicketPriority;
  name: string;
  color: string;
  responseTargetMinutes: number | null;
  resolutionTargetMinutes: number | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TicketSlaPolicy {
  id: string;
  name: string;
  description: string;
  priorityKey: TicketPriority;
  responseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
  isActive: boolean;
}

export interface TicketRoutingRule {
  id: string;
  name: string;
  description: string;
  matchWhen: Record<string, unknown>;
  action: Record<string, unknown>;
  priorityOrder: number;
  isActive: boolean;
}

export interface TicketCannedResponse {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  isInternal: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMailboxConfig {
  id: string;
  name: string;
  inboundAddress: string;
  outboundFrom: string | null;
  replyTo: string | null;
  defaultCategory: string | null;
  defaultPriority: TicketPriority;
  defaultTeam: string | null;
  isActive: boolean;
}
