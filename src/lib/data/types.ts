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

export interface Task {
  id: ID;
  title: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  assignedTo: string;
  linkedDocumentId?: ID;
  linkedAssetId?: ID;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: ID;
  title: string;
  category: string;
  content: string;
  linkedDocumentId?: ID;
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

export interface DataState {
  folders: Folder[];
  documents: Document[];
  assets: CMDBAsset[];
  ipam: IPAMEntry[];
  tasks: Task[];
  notes: Note[];
  trash: TrashItem[];
  activity: ActivityLog[];
  snapshots: LocalSnapshot[];
  notifications: NotificationItem[];
  settings: AppSettings;
}
