export const NOTE_CATEGORIES = [
  "General",
  "Network",
  "Security",
  "Backup",
  "M365",
  "Hardware",
  "Active Directory",
  "Virtualization",
];

export interface Note {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  isTemplate: boolean;
  owner: string;
  linkedDocumentId: string | null;
  linkedTicketIds: string[];
  linkedAssetIds: string[];
  linkedIpamIds: string[];
  linkedTaskIds: string[];
  linkedUserIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface NoteInput {
  title: string;
  category: string;
  content: string;
  tags: string[];
  pinned: boolean;
  isTemplate: boolean;
  linkedDocumentId: string | null;
}

export interface NoteLinksInput {
  linkedTicketIds: string[];
  linkedAssetIds: string[];
  linkedIpamIds: string[];
  linkedTaskIds: string[];
  linkedUserIds: string[];
}

export interface NoteTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteTemplateInput {
  name: string;
  category: string;
  content: string;
}
