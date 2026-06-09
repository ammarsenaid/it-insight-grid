export type ID = string;

export type DocType = "pdf" | "docx" | "xlsx" | "pptx" | "md" | "txt" | "image" | "file";
export type DocStatus = "draft" | "review" | "approved" | "archived";
export type Importance = "low" | "normal" | "high" | "critical";

export interface Folder {
  id: ID;
  name: string;
  parentId: ID | null;
  createdAt: string;
  updatedAt: string;
}

export type DocumentVisibility = "public" | "internal" | "restricted";

export interface DocumentVersion {
  id: ID;
  version: string;
  note: string;
  author: string;
  createdAt: string;
  size: number;
}

export interface DocumentRelations {
  ticketIds: ID[];
  assetIds: ID[];
  ipamIds: ID[];
  taskIds: ID[];
  noteIds: ID[];
  userIds: ID[];
}

export interface Document {
  id: ID;
  name: string;
  extension: DocType;
  title: string;
  description: string;
  folderId: ID | null;
  category: string;
  status: DocStatus;
  importance: Importance;
  owner: string;
  tags: string[];
  content: string;
  size: number;
  version: string;
  reviewDate?: string;
  favorite?: boolean;
  visibility?: DocumentVisibility;
  versions?: DocumentVersion[];
  relations?: DocumentRelations;
  createdAt: string;
  updatedAt: string;
}


export type AssetType = "server" | "vm" | "computer" | "network" | "application" | "storage";
export type AssetStatus = "active" | "maintenance" | "retired";
export type Environment = "production" | "staging" | "development";

export interface CMDBAsset {
  id: ID;
  hostname: string;
  displayName: string;
  assetType: AssetType;
  ipAddress: string;
  os: string;
  role: string;
  environment: Environment;
  location: string;
  owner: string;
  vendor: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  macAddress: string;
  status: AssetStatus;
  warrantyExpiration?: string;
  notes: string;
  dependencyIds?: ID[];
  createdAt: string;
  updatedAt: string;
}

export type IPType = "static" | "dhcp" | "reserved" | "virtual";
export type IPStatus = "used" | "free" | "reserved";

export interface IPAMEntry {
  id: ID;
  ipAddress: string;
  hostname: string;
  type: IPType;
  subnet: string;
  gateway: string;
  vlan: string;
  location: string;
  status: IPStatus;
  linkedAssetId?: ID;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskStatus = "open" | "in_progress" | "blocked" | "done";
export type TaskScope = "personal" | "team" | "shared";
export type TaskSource = "manual" | "ticket" | "protocol" | "note" | "template" | "maintenance";

export interface TaskRecurrence {
  freq: "daily" | "weekly" | "monthly" | "quarterly";
  interval: number;
}

export interface TaskChecklistItem {
  id: ID;
  title: string;
  completed: boolean;
  required: boolean;
  notes?: string;
}

export interface TaskComment {
  id: ID;
  author: string;
  body: string;
  at: string;
}

export interface Task {
  id: ID;
  title: string;
  description?: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  scope?: TaskScope;
  source?: TaskSource;
  dueDate?: string;
  reminderAt?: string;
  assignedTo: string;
  owner?: string;
  team?: string;
  tags?: string[];
  recurring?: TaskRecurrence | null;
  dependencyIds?: ID[];
  escalated?: boolean;
  archived?: boolean;
  watchers?: string[];
  checklist?: TaskChecklistItem[];
  comments?: TaskComment[];
  linkedDocumentId?: ID;
  linkedAssetId?: ID;
  linkedTicketIds?: ID[];
  linkedIpamIds?: ID[];
  linkedNoteIds?: ID[];
  linkedUserIds?: ID[];
  linkedProtocolRunIds?: ID[];
  linkedProtocolTemplateId?: ID;
  sourceTicketId?: ID;
  completedAt?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplate {
  id: ID;
  name: string;
  category: string;
  priority: TaskPriority;
  defaultTeam?: string;
  description?: string;
  tags?: string[];
  checklist?: Array<{ title: string; required?: boolean }>;
  recurring?: TaskRecurrence | null;
}

export interface TaskSavedView {
  id: ID;
  name: string;
  scope: "my" | "team" | "all";
  query: string;
  filters: Record<string, string>;
}

export interface NoteTemplate {
  id: ID;
  name: string;
  category: string;
  content: string;
}

export interface Note {
  id: ID;
  title: string;
  category: string;
  content: string;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
  isTemplate?: boolean;
  owner?: string;
  linkedDocumentId?: ID;
  linkedTicketIds?: ID[];
  linkedAssetIds?: ID[];
  linkedIpamIds?: ID[];
  linkedTaskIds?: ID[];
  linkedUserIds?: ID[];
  createdAt: string;
  updatedAt: string;
}

export type TrashKind = "folder" | "document" | "asset" | "ipam" | "task" | "note";

export interface TrashItem {
  id: ID;
  kind: TrashKind;
  name: string;
  originalLocation: string;
  payload: unknown;
  size: number;
  deletedAt: string;
}

export interface ActivityLog {
  id: ID;
  type: string;
  message: string;
  actor?: string;
  module?: string;
  entityType?: string;
  entityId?: ID;
  createdAt: string;
}

export interface LocalSnapshot {
  id: ID;
  name: string;
  createdAt: string;
  data: string;
  sizeBytes: number;
}

export interface AppSettings {
  appName: string;
  version: string;
  compactMode: boolean;
  tablePageSize: number;
  showNotifications: boolean;
  sidebarCollapsed: boolean;
  defaultDocView: "table" | "cards";
  showDashboardChart: boolean;
  reducedMotion: boolean;
}

export interface NotificationItem {
  id: ID;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "danger";
  createdAt: string;
  read?: boolean;
}

export type TicketPriority = "low" | "normal" | "high" | "critical";
export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed" | "cancelled";
export type TicketSLA = "ok" | "warning" | "breached";
export type TicketType = "incident" | "request" | "change" | "problem";
export type TicketSource = "email" | "portal" | "service_catalog" | "manual" | "internal" | "protocol" | "task";
export type UnknownRequesterFallback = "create_temp" | "assign_fallback" | "ignore" | "flag_review";

export interface TicketComment {
  id: ID;
  author: string;
  body: string;
  internal: boolean;
  createdAt: string;
}

export interface Ticket {
  id: ID;
  number: string;
  subject: string;
  description: string;
  requester: string;
  type: TicketType;
  category: string;
  subcategory?: string;
  priority: TicketPriority;
  status: TicketStatus;
  sla: TicketSLA;
  slaDueAt?: string;
  affectedService?: string;
  assignee?: string;
  team?: string;
  linkedAssetId?: ID;
  linkedIpamId?: ID;
  linkedDocumentId?: ID;
  tags: string[];
  attachments: string[];
  watchers: string[];
  comments: TicketComment[];
  source: TicketSource;
  sourceEmail?: string;
  sourceFlagged?: boolean;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketSavedView {
  id: ID;
  name: string;
  query: string;
  filters: Record<string, string>;
}

export interface CatalogItem {
  id: ID;
  name: string;
  category: string;
  icon: string; // lucide icon name
  description: string;
  estimatedTime: string;
  defaultPriority: TicketPriority;
  defaultTeam: string;
  fields: CatalogField[];
}

export interface CatalogField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface SLAPolicy {
  id: ID;
  priority: TicketPriority;
  responseMinutes: number;
  resolveMinutes: number;
}

export interface RoutingRule {
  id: ID;
  category: string;
  team: string;
}

export interface MailboxSettings {
  address: string;
  enabled: boolean;
  unknownFallback: UnknownRequesterFallback;
  fallbackRequester: string;
  defaultCategory: string;
  defaultTeam: string;
  defaultPriority: TicketPriority;
}

export interface TicketSettings {
  categories: string[];
  teams: string[];
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  slaPolicies: SLAPolicy[];
  routingRules: RoutingRule[];
  mailbox: MailboxSettings;
}


export type UserStatus = "active" | "archived";

export interface User {
  id: ID;
  username: string;
  displayName: string;
  email: string;
  department: string;
  team: string;
  role: string; // Role id from permissions
  title?: string;
  status: UserStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: ID;
  name: string;
  description: string;
  leadUserId?: ID;
  memberIds: ID[];
  queueOwnership: string[];
  assetScopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DataState {
  folders: Folder[];
  documents: Document[];
  assets: CMDBAsset[];
  ipam: IPAMEntry[];
  tasks: Task[];
  taskViews: TaskSavedView[];
  notes: Note[];
  noteTemplates: NoteTemplate[];
  tickets: Ticket[];
  ticketViews: TicketSavedView[];
  catalog: CatalogItem[];
  ticketSettings: TicketSettings;
  users: User[];
  teams: Team[];
  trash: TrashItem[];
  activity: ActivityLog[];
  snapshots: LocalSnapshot[];
  notifications: NotificationItem[];
  settings: AppSettings;
}

