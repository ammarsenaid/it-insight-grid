/**
 * LOVABLE PREVIEW ONLY — sample knowledge-base dataset.
 * Never used outside of preview hosts.
 */
import type {
  KbArticle,
  KbCategory,
  KbSpace,
  KbTag,
  KbArticleTag,
  KnowledgeBackendData,
} from "@/lib/knowledge/backend-types";
import { PREVIEW_TEAM } from "./previewIdentity";

const T = PREVIEW_TEAM.id;
const now = new Date().toISOString();
const day = (n: number) =>
  new Date(Date.now() - n * 86400_000).toISOString();

const spaces: KbSpace[] = [
  {
    id: "sp-runbooks",
    team_id: T,
    name: "Operations Runbooks",
    slug: "runbooks",
    description: "Step-by-step incident playbooks and recovery procedures.",
    is_archived: false,
    created_by: null,
    created_at: day(120),
    updated_at: day(2),
  },
  {
    id: "sp-onboarding",
    team_id: T,
    name: "People & Onboarding",
    slug: "onboarding",
    description: "Joiner, mover and leaver workflows for new teammates.",
    is_archived: false,
    created_by: null,
    created_at: day(90),
    updated_at: day(5),
  },
  {
    id: "sp-architecture",
    team_id: T,
    name: "Platform Architecture",
    slug: "architecture",
    description: "Reference diagrams, ADRs and SLOs for the platform.",
    is_archived: false,
    created_by: null,
    created_at: day(60),
    updated_at: day(1),
  },
];

const categories: KbCategory[] = [
  { id: "c-incidents", team_id: T, space_id: "sp-runbooks", name: "Incident response", slug: "incidents", description: "Severity ladder, comms, post-mortems.", sort_order: 1, is_archived: false, created_by: null, created_at: day(110), updated_at: day(3) },
  { id: "c-backups", team_id: T, space_id: "sp-runbooks", name: "Backups & recovery", slug: "backups", description: "RTO/RPO procedures.", sort_order: 2, is_archived: false, created_by: null, created_at: day(100), updated_at: day(4) },
  { id: "c-joiners", team_id: T, space_id: "sp-onboarding", name: "Joiners", slug: "joiners", description: "First-week IT setup.", sort_order: 1, is_archived: false, created_by: null, created_at: day(80), updated_at: day(6) },
  { id: "c-leavers", team_id: T, space_id: "sp-onboarding", name: "Leavers", slug: "leavers", description: "Offboarding checklist.", sort_order: 2, is_archived: false, created_by: null, created_at: day(70), updated_at: day(7) },
  { id: "c-adr", team_id: T, space_id: "sp-architecture", name: "ADRs", slug: "adr", description: "Architecture decision records.", sort_order: 1, is_archived: false, created_by: null, created_at: day(50), updated_at: day(2) },
];

const tags: KbTag[] = [
  { id: "t-sev1", team_id: T, name: "sev-1", slug: "sev-1", created_at: now, updated_at: now },
  { id: "t-network", team_id: T, name: "network", slug: "network", created_at: now, updated_at: now },
  { id: "t-security", team_id: T, name: "security", slug: "security", created_at: now, updated_at: now },
  { id: "t-onboarding", team_id: T, name: "onboarding", slug: "onboarding", created_at: now, updated_at: now },
  { id: "t-policy", team_id: T, name: "policy", slug: "policy", created_at: now, updated_at: now },
];

const mk = (
  id: string,
  category_id: string | null,
  space_id: string,
  title: string,
  excerpt: string,
  content_markdown: string,
  status: KbArticle["status"] = "published",
  daysOld = 5,
): KbArticle => ({
  id,
  team_id: T,
  space_id,
  category_id,
  title,
  slug: id,
  excerpt,
  content_markdown,
  status,
  visibility: "team",
  revision_number: 3,
  created_by: null,
  updated_by: null,
  published_at: day(daysOld),
  created_at: day(daysOld + 30),
  updated_at: day(daysOld),
});

const articles: KbArticle[] = [
  mk(
    "a-sev1",
    "c-incidents",
    "sp-runbooks",
    "Declaring a Severity 1 incident",
    "When and how to declare a Sev-1, who to page, and the first 15 minutes of comms.",
    `## When to declare\n\nA **Sev-1** applies when one or more of the following are true:\n\n- Customer-facing service is fully down for > 5 minutes.\n- Data loss or integrity risk is confirmed.\n- A security boundary has been breached.\n\n> If in doubt, declare. It is always cheaper to downgrade than to upgrade late.\n\n### First fifteen minutes\n\n1. Page the on-call via PagerDuty schedule \`platform-primary\`.\n2. Open the incident channel: \`#inc-YYYYMMDD-<slug>\`.\n3. Post the **status banner** in \`#general\` using the \`/banner\` slash command.\n4. Start the incident timeline doc from the template.\n\n### Roles\n\n| Role | Who |\n|---|---|\n| Incident Commander | On-call SRE |\n| Comms Lead | Eng manager on rotation |\n| Scribe | Any responder |\n\n\`\`\`bash\n# Quick health check\ncurl -fsS https://status.internal/api/health | jq '.services[] | select(.status != "ok")'\n\`\`\`\n`,
    "published",
    1,
  ),
  mk(
    "a-postmortem",
    "c-incidents",
    "sp-runbooks",
    "Writing a blameless post-mortem",
    "Our post-mortem template, tone guidance and review cadence.",
    `## Tone\n\nPost-mortems describe **systems**, not people. Replace "Alice forgot to" with "the deploy step did not enforce".\n\n## Sections\n\n1. Summary\n2. Timeline\n3. Contributing factors\n4. What went well\n5. Action items (owner, due date, severity)\n\n## Review\n\nDraft within 48h. Review in the weekly reliability sync. Publish to \`#eng-postmortems\`.\n`,
    "in_review",
    3,
  ),
  mk(
    "a-backup-restore",
    "c-backups",
    "sp-runbooks",
    "Restoring Postgres from a daily snapshot",
    "Step-by-step recovery for the primary cluster.",
    `## Prerequisites\n\n- Read access to the \`backups-prod\` S3 bucket.\n- A maintenance window approved by the on-call IC.\n\n## Procedure\n\n1. Pick the snapshot: \`aws s3 ls s3://backups-prod/pg/\`.\n2. Provision the restore cluster from Terraform module \`pg-restore\`.\n3. Apply the snapshot with \`pg_restore -j 8\`.\n4. Run smoke checks from \`/scripts/restore-smoke.sh\`.\n5. Cut traffic via the \`pgbouncer\` config flip.\n\n> RTO target: **45 minutes**. RPO target: **15 minutes**.\n`,
    "published",
    7,
  ),
  mk(
    "a-joiner-day-one",
    "c-joiners",
    "sp-onboarding",
    "Joiner — Day one IT setup",
    "Hardware, accounts and access for new joiners on day one.",
    `## Day one checklist\n\n- [ ] Laptop handed over and asset tag scanned in CMDB.\n- [ ] SSO account provisioned (Okta).\n- [ ] MFA enrolled (hardware key + TOTP backup).\n- [ ] Slack, Email, Calendar groups added.\n- [ ] Read **Acceptable Use Policy** and sign in HR portal.\n\n## Hardware standard\n\n| Role | Laptop |\n|---|---|\n| Engineering | MacBook Pro 16" M3 |\n| Operations | MacBook Air 15" M3 |\n| Sales / CS | MacBook Air 13" M3 |\n`,
    "published",
    14,
  ),
  mk(
    "a-leaver",
    "c-leavers",
    "sp-onboarding",
    "Leaver — Offboarding checklist",
    "What to revoke, when, and who signs off.",
    `## Same-day\n\n1. Disable SSO at the announced time (not before).\n2. Revoke production access tokens.\n3. Transfer ownership of Notion / Linear / GitHub assets.\n\n## Within 24h\n\n- Wipe and re-image laptop.\n- Archive Slack DMs per retention policy.\n- Close out any open tickets assigned to the leaver.\n`,
    "approved",
    21,
  ),
  mk(
    "a-adr-001",
    "c-adr",
    "sp-architecture",
    "ADR-001 — Choosing Postgres as the primary store",
    "Why we standardised on Postgres for transactional workloads.",
    `## Status\n\nAccepted — 2025-09-12\n\n## Context\n\nWe needed a single relational store with strong consistency, mature tooling and predictable cost at our scale (~10TB).\n\n## Decision\n\nUse **Postgres 16** managed via RDS for all new transactional services. Specialised stores (search, analytics) remain in scope as secondary systems.\n\n## Consequences\n\n- Single skillset across engineering.\n- Clear backup / restore story.\n- We accept the limits of vertical scaling up to ~32 vCPU before sharding.\n`,
    "published",
    30,
  ),
  mk(
    "a-slo",
    "c-adr",
    "sp-architecture",
    "Platform SLOs and error budgets",
    "Public-facing API SLOs and how we burn the error budget.",
    `## SLOs\n\n| Surface | Target | Window |\n|---|---|---|\n| Public API availability | 99.9% | 30d |\n| Public API p95 latency | < 250 ms | 30d |\n| Auth login success | 99.95% | 30d |\n\n## Burn policy\n\n- **2% in 1h** → page on-call.\n- **5% in 6h** → freeze risky deploys.\n- **10% in 24h** → incident review with engineering leadership.\n`,
    "draft",
    1,
  ),
];

const articleTags: KbArticleTag[] = [
  { article_id: "a-sev1", tag_id: "t-sev1", team_id: T },
  { article_id: "a-sev1", tag_id: "t-network", team_id: T },
  { article_id: "a-postmortem", tag_id: "t-sev1", team_id: T },
  { article_id: "a-backup-restore", tag_id: "t-sev1", team_id: T },
  { article_id: "a-joiner-day-one", tag_id: "t-onboarding", team_id: T },
  { article_id: "a-leaver", tag_id: "t-onboarding", team_id: T },
  { article_id: "a-leaver", tag_id: "t-security", team_id: T },
  { article_id: "a-adr-001", tag_id: "t-policy", team_id: T },
  { article_id: "a-slo", tag_id: "t-policy", team_id: T },
];

export const PREVIEW_KB_DATA: KnowledgeBackendData = {
  spaces,
  categories,
  articles,
  tags,
  articleTags,
};
