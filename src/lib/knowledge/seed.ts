import type { KnowledgeNode, KnowledgeState } from "./types";
import { emptyRelations } from "./types";
import { TEMPLATES } from "./templates";

let counter = 0;
const id = (p: string) => `${p}_${++counter}_${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

interface SeedNodeInput {
  type: KnowledgeNode["type"];
  title: string;
  description?: string;
  content?: string;
  status?: KnowledgeNode["status"];
  tags?: string[];
  reviewDate?: string;
  children?: SeedNodeInput[];
}

function build(
  inputs: SeedNodeInput[],
  parentId: string | null,
  acc: KnowledgeNode[],
  baseOwner: string,
): void {
  inputs.forEach((input, idx) => {
    const nodeId = id(input.type);
    const node: KnowledgeNode = {
      id: nodeId,
      type: input.type,
      parentId,
      title: input.title,
      slug: slug(input.title),
      description: input.description,
      content: input.content,
      status: input.status ?? (input.type === "page" ? "published" : "published"),
      visibility: "public_internal",
      ownerId: baseOwner,
      contributorIds: [],
      tags: input.tags ?? [],
      createdAt: daysAgo(30 + idx),
      updatedAt: daysAgo(idx + 1),
      reviewDate: input.reviewDate,
      version: input.type === "page" ? 2 : 1,
      order: idx,
      views: input.type === "page" ? Math.floor(Math.random() * 200) + 20 : undefined,
      relations: emptyRelations(),
      versions: [],
      reviews: [],
    };
    if (input.type === "page" && input.content) {
      node.versions = [
        {
          id: id("ver"),
          version: 1,
          author: baseOwner,
          note: "Initial draft",
          status: "draft",
          content: input.content,
          createdAt: daysAgo(20),
        },
        {
          id: id("ver"),
          version: 2,
          author: baseOwner,
          note: "Reviewed and published",
          status: "published",
          content: input.content,
          createdAt: daysAgo(2),
        },
      ];
      node.reviews = [
        { id: id("rev"), actor: baseOwner, action: "submit", comment: "Ready for review", createdAt: daysAgo(15) },
        { id: id("rev"), actor: "alice.it", action: "approve", comment: "Looks good", createdAt: daysAgo(8) },
        { id: id("rev"), actor: "alice.it", action: "publish", createdAt: daysAgo(2) },
      ];
    }
    acc.push(node);
    if (input.children) build(input.children, nodeId, acc, baseOwner);
  });
}

export function buildKnowledgeSeed(): KnowledgeState {
  counter = 0;
  const nodes: KnowledgeNode[] = [];

  const tree: SeedNodeInput[] = [
    {
      type: "space",
      title: "IT Documentation",
      description: "Internal IT operations knowledge base.",
      tags: ["it", "ops"],
      children: [
        {
          type: "book",
          title: "Infrastructure",
          description: "Servers, virtualization, and storage.",
          children: [
            {
              type: "chapter",
              title: "Server Operations",
              children: [
                {
                  type: "chapter",
                  title: "Hyper-V Administration",
                  children: [
                    {
                      type: "page",
                      title: "Overview",
                      description: "Introduction to the Hyper-V environment.",
                      tags: ["hyper-v", "virtualization"],
                      reviewDate: daysAhead(60),
                      content: `# Hyper-V Overview\n\nOur Hyper-V environment hosts production VMs across two clustered hosts.\n\n## Cluster Nodes\n\n- HYPERV01\n- HYPERV02\n\n## Shared Storage\n\nCluster shared volumes on the SAN.\n\n## Management\n\n- Failover Cluster Manager\n- Windows Admin Center\n`,
                    },
                    {
                      type: "page",
                      title: "Installation",
                      description: "Installing the Hyper-V role on Windows Server.",
                      tags: ["installation"],
                      content: `# Hyper-V Installation\n\n## Prerequisites\n\n- Windows Server 2022\n- Hardware virtualization enabled in BIOS\n\n## Steps\n\n1. Open Server Manager\n2. Add Roles → Hyper-V\n3. Select network adapters\n4. Configure live migration\n5. Reboot\n\n## Verification\n\n\`\`\`powershell\nGet-WindowsFeature Hyper-V\n\`\`\``,
                    },
                    {
                      type: "page",
                      title: "Cluster Configuration",
                      tags: ["cluster"],
                      content: `# Cluster Configuration\n\n## Validate\n\nRun cluster validation before adding nodes.\n\n## Quorum\n\nFile share witness on FILESRV01.\n\n## Networks\n\n- Management\n- Live Migration\n- Cluster Heartbeat\n`,
                    },
                    {
                      type: "chapter",
                      title: "Troubleshooting",
                      children: [
                        {
                          type: "page",
                          title: "VM does not start",
                          content: `# VM does not start\n\n## Symptoms\n\nThe VM fails to start with error 0x80070569.\n\n## Diagnostic Steps\n\n1. Check the event log\n2. Verify NTFS permissions on the VHDX\n3. Confirm the user has Replicate Directory access\n\n## Resolution\n\nGrant the Hyper-V Virtual Machine Management service correct rights.\n`,
                        },
                        {
                          type: "page",
                          title: "Storage latency issue",
                          content: `# Storage latency issue\n\n## Symptoms\n\nGuest OS reports slow disk.\n\n## Diagnostics\n\n- Check SAN queue depth\n- Inspect CSV ownership\n\n## Resolution\n\nRebalance CSV ownership across nodes.\n`,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: "chapter",
              title: "Backup and Recovery",
              children: [
                {
                  type: "page",
                  title: "Backup Strategy Overview",
                  tags: ["backup"],
                  content: `# Backup Strategy\n\nWe follow the 3-2-1 rule.\n\n## Targets\n\n- Veeam B&R repository\n- Offsite immutable storage\n`,
                },
                {
                  type: "page",
                  title: "Restore Procedure",
                  status: "approved",
                  content: `# Restore Procedure\n\n1. Identify backup point\n2. Mount restore session\n3. Validate integrity\n4. Promote to production\n`,
                },
              ],
            },
          ],
        },
        {
          type: "book",
          title: "Identity & Access",
          description: "Active Directory, Microsoft 365, and identity governance.",
          children: [
            {
              type: "chapter",
              title: "Active Directory",
              children: [
                {
                  type: "page",
                  title: "Domain Controller Overview",
                  tags: ["ad", "dc"],
                  content: `# Domain Controllers\n\n- DC01 — primary, FSMO roles\n- DC02 — secondary\n\n## Sites\n\n- HQ\n- Branch-EU\n`,
                },
                {
                  type: "page",
                  title: "Account Creation SOP",
                  status: "approved",
                  content: `# Account Creation\n\n## Process\n\n1. Create user in OU\n2. Add to default groups\n3. Assign Microsoft 365 license\n4. Notify the manager\n`,
                },
                {
                  type: "page",
                  title: "Account Disablement SOP",
                  status: "in_review",
                  content: `# Account Disablement\n\n## Process\n\n1. Disable account in AD\n2. Move to Disabled OU\n3. Convert mailbox to shared\n4. Revoke MFA tokens\n`,
                },
              ],
            },
            {
              type: "chapter",
              title: "Microsoft 365",
              children: [
                {
                  type: "page",
                  title: "Tenant Overview",
                  content: `# Microsoft 365 Tenant\n\n- Tenant: contoso.onmicrosoft.com\n- Licenses: E3, E5\n`,
                },
                {
                  type: "page",
                  title: "Exchange Online Mail Flow",
                  content: `# Mail Flow\n\nInbound goes through Proofpoint, then Exchange Online.\n`,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "space",
      title: "Employee Handbook",
      description: "Policies and onboarding information for staff.",
      tags: ["hr", "policy"],
      children: [
        {
          type: "book",
          title: "IT Onboarding",
          children: [
            {
              type: "page",
              title: "First Day Checklist",
              content: `# First Day\n\n- [ ] Pick up laptop\n- [ ] Sign in to email\n- [ ] Complete security training\n- [ ] Meet your manager\n`,
            },
            {
              type: "page",
              title: "Account Creation",
              content: `# Account Creation\n\nYour account is created automatically the day before your start date.\n`,
            },
            {
              type: "page",
              title: "Laptop Setup",
              content: `# Laptop Setup\n\n1. Power on\n2. Sign in with your work account\n3. Complete Autopilot setup\n`,
            },
            {
              type: "page",
              title: "Microsoft 365 Access",
              content: `# Microsoft 365 Access\n\nNavigate to https://office.com and sign in with your corporate identity.\n`,
            },
          ],
        },
        {
          type: "book",
          title: "IT Policies",
          children: [
            {
              type: "page",
              title: "Acceptable Use Policy",
              status: "approved",
              content: `# Acceptable Use\n\nThis policy describes acceptable use of company IT resources.\n`,
            },
            {
              type: "page",
              title: "Password Policy",
              status: "published",
              content: `# Password Policy\n\n- Minimum 14 characters\n- MFA required\n- Rotated on suspicion of compromise\n`,
            },
          ],
        },
      ],
    },
    {
      type: "space",
      title: "Service Desk Playbook",
      description: "Operational runbooks for the service desk.",
      tags: ["servicedesk"],
      children: [
        {
          type: "book",
          title: "Incident Response",
          children: [
            {
              type: "chapter",
              title: "Triage",
              children: [
                {
                  type: "page",
                  title: "Priority Matrix",
                  content: `# Priority Matrix\n\n| Impact | Urgency | Priority |\n| --- | --- | --- |\n| High | High | P1 |\n| High | Medium | P2 |\n| Medium | Medium | P3 |\n| Low | Low | P4 |\n`,
                },
                {
                  type: "page",
                  title: "P1 Bridge Procedure",
                  status: "approved",
                  content: `# P1 Bridge\n\n1. Open Teams bridge\n2. Notify the on-call SRE\n3. Start a status update cadence every 30 minutes\n`,
                },
              ],
            },
            {
              type: "chapter",
              title: "Common Tickets",
              children: [
                {
                  type: "page",
                  title: "VPN troubleshooting",
                  content: `# VPN troubleshooting\n\n## Symptoms\n\n- Cannot connect\n- Drops after a few minutes\n\n## Steps\n\n1. Check internet connectivity\n2. Reinstall the VPN client\n3. Open a network ticket if persistent\n`,
                },
                {
                  type: "page",
                  title: "Mailbox quota exceeded",
                  content: `# Mailbox quota exceeded\n\n1. Review largest folders\n2. Empty Deleted Items\n3. Request quota increase if business-justified\n`,
                },
              ],
            },
          ],
        },
        {
          type: "book",
          title: "Knowledge Templates",
          description: "Reference page styles.",
          children: [
            {
              type: "page",
              title: "How we write documentation",
              content: `# Documentation Style\n\n- Use clear headings\n- One topic per page\n- Cross-link related pages\n`,
            },
          ],
        },
      ],
    },
  ];

  build(tree, null, nodes, "alice.it");

  return {
    nodes,
    templates: TEMPLATES,
    feedback: [],
    recent: [],
  };
}
