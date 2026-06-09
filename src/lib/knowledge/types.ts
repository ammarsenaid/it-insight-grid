export type KnowledgeNodeType = "space" | "book" | "chapter" | "page";

export type KnowledgeStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "archived";

export type KnowledgeVisibility = "public_internal" | "restricted" | "confidential";

export interface KnowledgeRelations {
  ticketIds: string[];
  assetIds: string[];
  ipamIds: string[];
  taskIds: string[];
  noteIds: string[];
  userIds: string[];
  pageIds: string[];
}

export interface KnowledgeVersion {
  id: string;
  version: number;
  author: string;
  note: string;
  status: KnowledgeStatus;
  content: string;
  createdAt: string;
}

export interface KnowledgeReviewEvent {
  id: string;
  actor: string;
  action: "submit" | "approve" | "reject" | "publish" | "archive" | "restore";
  comment?: string;
  createdAt: string;
}

export interface KnowledgeFeedback {
  id: string;
  pageId: string;
  helpful: boolean;
  comment?: string;
  createdAt: string;
}

export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  parentId: string | null;
  title: string;
  slug: string;
  description?: string;
  content?: string;
  status: KnowledgeStatus;
  visibility: KnowledgeVisibility;
  ownerId: string;
  contributorIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  reviewDate?: string;
  version: number;
  favorite?: boolean;
  order: number;
  icon?: string;
  views?: number;
  relations?: KnowledgeRelations;
  versions?: KnowledgeVersion[];
  reviews?: KnowledgeReviewEvent[];
}

export interface KnowledgeTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string;
}

export interface KnowledgeState {
  nodes: KnowledgeNode[];
  templates: KnowledgeTemplate[];
  feedback: KnowledgeFeedback[];
  recent: string[];
}

export const STATUS_TONE: Record<KnowledgeStatus, "default" | "warning" | "info" | "success" | "muted"> = {
  draft: "warning",
  in_review: "info",
  approved: "success",
  published: "success",
  archived: "muted",
};

export const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

export function emptyRelations(): KnowledgeRelations {
  return {
    ticketIds: [],
    assetIds: [],
    ipamIds: [],
    taskIds: [],
    noteIds: [],
    userIds: [],
    pageIds: [],
  };
}
