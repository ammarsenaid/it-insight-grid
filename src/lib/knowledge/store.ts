import { useSyncExternalStore } from "react";
import { buildKnowledgeSeed } from "./seed";
import { TEMPLATES } from "./templates";
import type {
  KnowledgeFeedback,
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeReviewEvent,
  KnowledgeState,
  KnowledgeStatus,
  KnowledgeVersion,
} from "./types";
import { emptyRelations } from "./types";

const KEY = "ikc.knowledge.v1";

let state: KnowledgeState = load();
const listeners = new Set<() => void>();

function load(): KnowledgeState {
  if (typeof window === "undefined") return buildKnowledgeSeed();
  try {
    const seeded = buildKnowledgeSeed();
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<KnowledgeState>;
    const merged: KnowledgeState = {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : seeded.nodes,
      templates: TEMPLATES,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    };
    return merged;
  } catch {
    return buildKnowledgeSeed();
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error("knowledge persist failed", e);
  }
}

function notify() {
  listeners.forEach((l) => l());
}

function setState(updater: (s: KnowledgeState) => KnowledgeState) {
  state = updater(state);
  persist();
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useKnowledge(): KnowledgeState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getKnowledgeState(): KnowledgeState {
  return state;
}

const uid = (p: string) =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const nowISO = () => new Date().toISOString();

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ---------- Read helpers ----------

export function getChildren(parentId: string | null, nodes = state.nodes): KnowledgeNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getDescendantIds(rootId: string, nodes = state.nodes): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    nodes.filter((n) => n.parentId === id).forEach((c) => {
      out.push(c.id);
      walk(c.id);
    });
  };
  walk(rootId);
  return out;
}

export function getAncestry(nodeId: string, nodes = state.nodes): KnowledgeNode[] {
  const out: KnowledgeNode[] = [];
  let cur = nodes.find((n) => n.id === nodeId);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? nodes.find((n) => n.id === cur!.parentId) : undefined;
  }
  return out;
}

export function getNode(id: string | null | undefined): KnowledgeNode | null {
  if (!id) return null;
  return state.nodes.find((n) => n.id === id) ?? null;
}

export function findSiblings(nodeId: string, nodes = state.nodes) {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { prev: null, next: null };
  const siblings = getChildren(node.parentId, nodes).filter((n) => n.type === "page");
  const idx = siblings.findIndex((s) => s.id === nodeId);
  return {
    prev: idx > 0 ? siblings[idx - 1] : null,
    next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
  };
}

// ---------- CRUD ----------

export function createNode(input: {
  type: KnowledgeNodeType;
  parentId: string | null;
  title: string;
  description?: string;
  content?: string;
  templateId?: string;
  ownerId?: string;
}): KnowledgeNode {
  const template = input.templateId
    ? TEMPLATES.find((t) => t.id === input.templateId)
    : undefined;
  const content =
    input.content ??
    template?.content ??
    (input.type === "page" ? `# ${input.title}\n\nStart writing here…` : undefined);
  const siblings = getChildren(input.parentId);
  const node: KnowledgeNode = {
    id: uid(input.type),
    type: input.type,
    parentId: input.parentId,
    title: input.title.trim() || "Untitled",
    slug: slugify(input.title) || uid("p"),
    description: input.description,
    content,
    status: input.type === "page" ? "draft" : "published",
    visibility: "public_internal",
    ownerId: input.ownerId ?? "you",
    contributorIds: [],
    tags: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    version: 1,
    order: siblings.length,
    favorite: false,
    views: 0,
    relations: emptyRelations(),
    versions:
      input.type === "page" && content
        ? [
            {
              id: uid("ver"),
              version: 1,
              author: input.ownerId ?? "you",
              note: template ? `Created from "${template.name}"` : "Initial draft",
              status: "draft",
              content,
              createdAt: nowISO(),
            },
          ]
        : [],
    reviews: [],
  };
  setState((s) => ({ ...s, nodes: [...s.nodes, node] }));
  return node;
}

export function updateNode(id: string, patch: Partial<KnowledgeNode>) {
  setState((s) => ({
    ...s,
    nodes: s.nodes.map((n) =>
      n.id === id ? { ...n, ...patch, updatedAt: nowISO() } : n,
    ),
  }));
}

export function saveContent(
  id: string,
  content: string,
  options: { author?: string; note?: string; createVersion?: boolean } = {},
) {
  const node = getNode(id);
  if (!node) return;
  const newVersionNumber = (node.version ?? 1) + 1;
  const versionEntry: KnowledgeVersion = {
    id: uid("ver"),
    version: newVersionNumber,
    author: options.author ?? "you",
    note: options.note ?? "Edited",
    status: node.status,
    content,
    createdAt: nowISO(),
  };
  setState((s) => ({
    ...s,
    nodes: s.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            content,
            version: options.createVersion === false ? n.version : newVersionNumber,
            versions:
              options.createVersion === false
                ? n.versions
                : [...(n.versions ?? []), versionEntry],
            updatedAt: nowISO(),
          }
        : n,
    ),
  }));
}

export function setStatus(
  id: string,
  status: KnowledgeStatus,
  action: KnowledgeReviewEvent["action"],
  comment?: string,
  actor = "you",
) {
  const event: KnowledgeReviewEvent = {
    id: uid("rev"),
    actor,
    action,
    comment,
    createdAt: nowISO(),
  };
  setState((s) => ({
    ...s,
    nodes: s.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            status,
            reviews: [...(n.reviews ?? []), event],
            updatedAt: nowISO(),
          }
        : n,
    ),
  }));
}

export function duplicateNode(id: string): KnowledgeNode | null {
  const src = getNode(id);
  if (!src) return null;
  const copy: KnowledgeNode = {
    ...src,
    id: uid(src.type),
    title: `${src.title} (copy)`,
    slug: slugify(`${src.title}-copy`),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    version: 1,
    versions: [],
    reviews: [],
    status: "draft",
  };
  setState((s) => ({ ...s, nodes: [...s.nodes, copy] }));
  return copy;
}

export function moveNode(id: string, newParentId: string | null) {
  if (id === newParentId) return false;
  const descendants = getDescendantIds(id);
  if (newParentId && descendants.includes(newParentId)) return false;
  setState((s) => ({
    ...s,
    nodes: s.nodes.map((n) =>
      n.id === id ? { ...n, parentId: newParentId, updatedAt: nowISO() } : n,
    ),
  }));
  return true;
}

export function archiveNode(id: string) {
  const ids = [id, ...getDescendantIds(id)];
  setState((s) => ({
    ...s,
    nodes: s.nodes.map((n) =>
      ids.includes(n.id) ? { ...n, status: "archived", updatedAt: nowISO() } : n,
    ),
  }));
}

export function deleteNode(id: string) {
  const ids = [id, ...getDescendantIds(id)];
  setState((s) => ({
    ...s,
    nodes: s.nodes.filter((n) => !ids.includes(n.id)),
  }));
}

export function toggleFavorite(id: string) {
  setState((s) => ({
    ...s,
    nodes: s.nodes.map((n) => (n.id === id ? { ...n, favorite: !n.favorite } : n)),
  }));
}

export function restoreVersion(nodeId: string, versionId: string, actor = "you") {
  const node = getNode(nodeId);
  const version = node?.versions?.find((v) => v.id === versionId);
  if (!node || !version) return;
  saveContent(nodeId, version.content, {
    author: actor,
    note: `Restored from v${version.version}`,
  });
}

export function recordView(id: string) {
  setState((s) => {
    const recent = [id, ...s.recent.filter((x) => x !== id)].slice(0, 20);
    return {
      ...s,
      recent,
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, views: (n.views ?? 0) + 1 } : n,
      ),
    };
  });
}

export function addFeedback(
  pageId: string,
  helpful: boolean,
  comment?: string,
): KnowledgeFeedback {
  const fb: KnowledgeFeedback = {
    id: uid("fb"),
    pageId,
    helpful,
    comment,
    createdAt: nowISO(),
  };
  setState((s) => ({ ...s, feedback: [fb, ...s.feedback] }));
  return fb;
}
