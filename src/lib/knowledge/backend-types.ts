// Real backend schema types for the IT Knowledge Center.
// Mirrors Batch 002 tables exactly. Do NOT add prototype-only fields here.

export type ArticleStatus = "draft" | "in_review" | "approved" | "published" | "archived";
export type ArticleVisibility = string;

export interface KbSpace {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbCategory {
  id: string;
  team_id: string;
  space_id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbArticle {
  id: string;
  team_id: string;
  space_id: string;
  category_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  content_markdown: string | null;
  status: ArticleStatus;
  visibility: ArticleVisibility;
  revision_number: number;
  created_by: string | null;
  updated_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbTag {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface KbArticleTag {
  article_id: string;
  tag_id: string;
  team_id: string;
}

export interface KbRevision {
  id: string;
  article_id: string;
  team_id: string;
  version_number: number;
  space_id: string;
  category_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  content_markdown: string | null;
  status: ArticleStatus;
  visibility: ArticleVisibility;
  edited_by: string | null;
  created_at: string;
}

export type BackendNodeType = "space" | "category" | "article";

export interface KbShelf {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_color: string | null;
  sort_order: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbShelfBook {
  shelf_id: string;
  space_id: string;
  team_id: string;
  sort_order: number;
  added_at: string;
}

export interface KnowledgeBackendData {
  spaces: KbSpace[];
  categories: KbCategory[];
  articles: KbArticle[];
  tags: KbTag[];
  articleTags: KbArticleTag[];
  /** Empty until the knowledge_shelves migration is applied. */
  shelves: KbShelf[];
  /** Empty until the knowledge_shelves migration is applied. */
  shelfBooks: KbShelfBook[];
}
