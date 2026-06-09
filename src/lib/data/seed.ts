import type {
  DataState,
  Folder,
  Document,
  CMDBAsset,
  IPAMEntry,
  Task,
  TaskSavedView,
  Note,
  NoteTemplate,
  Ticket,
  ActivityLog,
  NotificationItem,
  AppSettings,
} from "./types";

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

let i = 0;
const id = (p: string) => `${p}_${++i}_${Math.random().toString(36).slice(2, 7)}`;

export function buildSeed(): DataState {
  i = 0;
  const folderNames = [
    "01 - General Documentation",
    "02 - Network",
    "03 - Active Directory",
    "04 - Microsoft 365",
    "05 - Security",
    "06 - Backup and Recovery",
    "07 - Server Hyper-V",
    "08 - Applications",
    "09 - Onboarding",
    "10 - Archive",
  ];
  const folders: Folder[] = folderNames.map((name) => ({
    id: id("fld"),
    name,
    parentId: null,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(10),
  }));

  // a subfolder
  folders.push({
    id: id("fld"),
    name: "Firewall Rules",
    parentId: folders[1].id,
    createdAt: daysAgo(40),
    updatedAt: daysAgo(5),
  });
  folders.push({
    id: id("fld"),
    name: "Group Policies",
    parentId: folders[2].id,
    createdAt: daysAgo(35),
    updatedAt: daysAgo(3),
  });

  const docTemplates: Array<Partial<Document> & { name: string; ext: Document["extension"]; folderIdx: number; cat: string }> = [
    { name: "Network Topology Overview", ext: "pdf", folderIdx: 1, cat: "Network", description: "Complete diagram of corporate network." },
    { name: "Firewall Configuration Baseline", ext: "md", folderIdx: 10, cat: "Security", description: "Baseline rules for perimeter firewall." },
    { name: "AD Forest Design", ext: "docx", folderIdx: 2, cat: "Active Directory", description: "Design document for AD forest." },
    { name: "M365 Tenant Settings", ext: "xlsx", folderIdx: 3, cat: "M365", description: "Inventory of tenant configuration." },
    { name: "Incident Response Plan", ext: "pdf", folderIdx: 4, cat: "Security", description: "Standard IR playbook." },
    { name: "Backup Schedule Q1", ext: "xlsx", folderIdx: 5, cat: "Backup", description: "Veeam job schedule." },
    { name: "Hyper-V Cluster Runbook", ext: "md", folderIdx: 6, cat: "Virtualization", description: "Operational runbook for HV cluster." },
    { name: "Onboarding Checklist", ext: "docx", folderIdx: 8, cat: "HR/IT", description: "Standard onboarding for new hires." },
    { name: "Patch Management Policy", ext: "pdf", folderIdx: 4, cat: "Security", description: "Monthly patching policy." },
    { name: "VPN User Guide", ext: "md", folderIdx: 1, cat: "Network", description: "How to connect via corporate VPN." },
    { name: "Office 365 Migration Plan", ext: "pptx", folderIdx: 3, cat: "M365", description: "Migration strategy." },
    { name: "Disaster Recovery Plan", ext: "pdf", folderIdx: 5, cat: "Backup", description: "DR plan and runbook." },
    { name: "Rack Layout DC1", ext: "image", folderIdx: 1, cat: "Network", description: "Physical rack diagram." },
    { name: "License Inventory", ext: "xlsx", folderIdx: 7, cat: "Applications", description: "Software licensing tracker." },
    { name: "Default GPO List", ext: "md", folderIdx: 11, cat: "Active Directory", description: "Default group policies applied." },
    { name: "Helpdesk SLA", ext: "pdf", folderIdx: 0, cat: "General", description: "Service level agreements." },
    { name: "Endpoint Security Standard", ext: "docx", folderIdx: 4, cat: "Security", description: "EDR and AV configuration." },
    { name: "Server Inventory Snapshot", ext: "txt", folderIdx: 6, cat: "Virtualization", description: "Plain inventory list." },
    { name: "Veeam Repository Sizing", ext: "xlsx", folderIdx: 5, cat: "Backup", description: "Capacity planning." },
    { name: "Archived 2022 Procedures", ext: "pdf", folderIdx: 9, cat: "Archive", description: "Old procedures from 2022." },
    { name: "Switch Stack Configuration", ext: "md", folderIdx: 1, cat: "Network", description: "Core switch stack details." },
    { name: "Application Catalog", ext: "xlsx", folderIdx: 7, cat: "Applications", description: "All managed applications." },
  ];

  const statuses: Document["status"][] = ["draft", "review", "approved", "approved", "archived"];
  const imps: Document["importance"][] = ["low", "normal", "high", "critical"];
  const owners = ["alice.it", "bob.admin", "carol.netops", "david.secops"];

  const sampleContent = "# Overview\n\nThis is a mock document used in the prototype.\n\n## Sections\n- Configuration\n- Procedures\n- References\n\nAll content is stored locally in your browser.";

  const documents: Document[] = docTemplates.map((t, idx) => ({
    id: id("doc"),
    name: t.name,
    extension: t.ext,
    title: t.name,
    description: t.description ?? "",
    folderId: folders[t.folderIdx]?.id ?? null,
    category: t.cat,
    status: statuses[idx % statuses.length],
    importance: imps[idx % imps.length],
    owner: owners[idx % owners.length],
    tags: [t.cat.toLowerCase()],
    content: sampleContent,
    size: 24_000 + idx * 4137,
    version: "1." + (idx % 6),
    reviewDate: daysAhead(30 + (idx % 60)),
    createdAt: daysAgo(50 - idx),
    updatedAt: daysAgo(idx % 25),
  }));

  const assetSeed = [
    { hostname: "DC01", display: "Primary Domain Controller", type: "server", ip: "192.168.0.10", os: "Windows Server 2022", role: "Domain Controller", env: "production" },
    { hostname: "DC02", display: "Secondary Domain Controller", type: "server", ip: "192.168.0.11", os: "Windows Server 2022", role: "Domain Controller", env: "production" },
    { hostname: "HYPERV01", display: "Hyper-V Host 01", type: "server", ip: "192.168.0.20", os: "Windows Server 2022", role: "Virtualization", env: "production" },
    { hostname: "HYPERV02", display: "Hyper-V Host 02", type: "server", ip: "192.168.0.21", os: "Windows Server 2022", role: "Virtualization", env: "production" },
    { hostname: "FILESERVER01", display: "Corporate File Server", type: "server", ip: "192.168.0.30", os: "Windows Server 2019", role: "File Storage", env: "production" },
    { hostname: "BACKUP01", display: "Veeam Backup Server", type: "server", ip: "192.168.0.40", os: "Windows Server 2022", role: "Backup", env: "production" },
    { hostname: "FIREWALL01", display: "Edge Firewall", type: "network", ip: "192.168.0.1", os: "FortiOS 7.2", role: "Firewall", env: "production" },
    { hostname: "SWITCH-CORE-01", display: "Core Switch Stack", type: "network", ip: "192.168.0.2", os: "Cisco IOS 17", role: "Core Switch", env: "production" },
    { hostname: "SWITCH-FLOOR2", display: "Floor 2 Access Switch", type: "network", ip: "192.168.0.3", os: "Cisco IOS 17", role: "Access Switch", env: "production" },
    { hostname: "M365-TENANT", display: "Microsoft 365 Tenant", type: "application", ip: "—", os: "Cloud", role: "SaaS", env: "production" },
    { hostname: "WS-ADMIN-01", display: "Admin Workstation", type: "computer", ip: "192.168.10.50", os: "Windows 11 Pro", role: "Admin", env: "production" },
    { hostname: "PRINTSRV01", display: "Print Server", type: "server", ip: "192.168.0.50", os: "Windows Server 2019", role: "Print", env: "production" },
    { hostname: "SANSTORAGE01", display: "Primary SAN", type: "storage", ip: "192.168.0.60", os: "Dell ME5", role: "Storage", env: "production" },
  ];
  const assetStatus: CMDBAsset["status"][] = ["active", "active", "active", "maintenance", "active", "active", "active", "active", "retired", "active", "active", "active", "active"];

  const assets: CMDBAsset[] = assetSeed.map((a, idx) => ({
    id: id("ast"),
    hostname: a.hostname,
    displayName: a.display,
    assetType: a.type as CMDBAsset["assetType"],
    ipAddress: a.ip,
    os: a.os,
    role: a.role,
    environment: a.env as CMDBAsset["environment"],
    location: idx % 2 === 0 ? "DC1 - Rack A" : "DC1 - Rack B",
    owner: owners[idx % owners.length],
    vendor: a.type === "network" ? "Cisco" : a.type === "storage" ? "Dell" : "Dell",
    model: "PowerEdge R750",
    serialNumber: "SN" + (10000 + idx),
    assetTag: "IT-" + (1000 + idx),
    macAddress: `00:1A:2B:${(idx + 10).toString(16).padStart(2, "0").toUpperCase()}:FF:0${idx % 10}`,
    status: assetStatus[idx],
    warrantyExpiration: daysAhead(180 + idx * 30),
    notes: "",
    createdAt: daysAgo(100 - idx),
    updatedAt: daysAgo(idx),
  }));

  const ipSeed = [
    { ip: "192.168.0.1", host: "FIREWALL01", type: "static", status: "used" },
    { ip: "192.168.0.2", host: "SWITCH-CORE-01", type: "static", status: "used" },
    { ip: "192.168.0.3", host: "SWITCH-FLOOR2", type: "static", status: "used" },
    { ip: "192.168.0.10", host: "DC01", type: "static", status: "used" },
    { ip: "192.168.0.11", host: "DC02", type: "static", status: "used" },
    { ip: "192.168.0.20", host: "HYPERV01", type: "static", status: "used" },
    { ip: "192.168.0.21", host: "HYPERV02", type: "static", status: "used" },
    { ip: "192.168.0.30", host: "FILESERVER01", type: "static", status: "used" },
    { ip: "192.168.0.40", host: "BACKUP01", type: "static", status: "used" },
    { ip: "192.168.0.50", host: "PRINTSRV01", type: "static", status: "used" },
    { ip: "192.168.0.60", host: "SANSTORAGE01", type: "static", status: "used" },
    { ip: "192.168.0.100", host: "—", type: "reserved", status: "reserved" },
    { ip: "192.168.0.101", host: "—", type: "reserved", status: "reserved" },
    { ip: "192.168.10.50", host: "WS-ADMIN-01", type: "dhcp", status: "used" },
    { ip: "192.168.10.51", host: "—", type: "dhcp", status: "free" },
  ];
  const ipam: IPAMEntry[] = ipSeed.map((p, idx) => {
    const subnet = p.ip.startsWith("192.168.0") ? "192.168.0.0/24" : "192.168.10.0/24";
    const gateway = subnet === "192.168.0.0/24" ? "192.168.0.1" : "192.168.10.1";
    const linked = assets.find((a) => a.hostname === p.host);
    return {
      id: id("ip"),
      ipAddress: p.ip,
      hostname: p.host,
      type: p.type as IPAMEntry["type"],
      subnet,
      gateway,
      vlan: subnet === "192.168.0.0/24" ? "VLAN 10 - Servers" : "VLAN 20 - Workstations",
      location: "DC1",
      status: p.status as IPAMEntry["status"],
      linkedAssetId: linked?.id,
      notes: "",
      createdAt: daysAgo(80 - idx),
      updatedAt: daysAgo(idx),
    };
  });

  const taskSeed = [
    { title: "Patch DC01 to latest CU", cat: "Patching", prio: "high", status: "open", due: daysAhead(2) },
    { title: "Renew SSL certificate for portal.acme.local", cat: "Security", prio: "critical", status: "open", due: daysAhead(-1) },
    { title: "Verify backup restore for FILESERVER01", cat: "Backup", prio: "high", status: "in_progress", due: daysAhead(5) },
    { title: "Document new VLAN 30", cat: "Documentation", prio: "normal", status: "open", due: daysAhead(7) },
    { title: "Replace failing disk in SANSTORAGE01", cat: "Hardware", prio: "critical", status: "in_progress", due: daysAhead(1) },
    { title: "Audit M365 admin roles", cat: "Security", prio: "high", status: "open", due: daysAhead(-3) },
    { title: "Onboard new finance user", cat: "Onboarding", prio: "normal", status: "done", due: daysAgo(2) },
    { title: "Update firewall rules for partner VPN", cat: "Network", prio: "high", status: "blocked", due: daysAhead(3) },
    { title: "Quarterly DR test", cat: "Backup", prio: "high", status: "open", due: daysAhead(14) },
    { title: "Decommission SWITCH-FLOOR2", cat: "Network", prio: "normal", status: "open", due: daysAhead(20) },
    { title: "Review GPO baselines", cat: "Active Directory", prio: "normal", status: "in_progress", due: daysAhead(10) },
    { title: "Update endpoint EDR policy", cat: "Security", prio: "high", status: "done", due: daysAgo(5) },
  ];

  const tasks: Task[] = taskSeed.map((t, idx) => ({
    id: id("tsk"),
    title: t.title,
    description: "",
    category: t.cat,
    priority: t.prio as Task["priority"],
    status: t.status as Task["status"],
    scope: idx % 3 === 0 ? "personal" : idx % 3 === 1 ? "team" : "shared",
    dueDate: t.due,
    assignedTo: owners[idx % owners.length],
    owner: owners[idx % owners.length],
    team: ["Infrastructure", "Network", "Security", "Service Desk"][idx % 4],
    tags: [t.cat.toLowerCase()],
    recurring: idx === 8 ? { freq: "monthly", interval: 1 } : null,
    dependencyIds: [],
    escalated: t.prio === "critical" && t.status !== "done",
    archived: false,
    watchers: [],
    linkedDocumentId: idx % 3 === 0 ? documents[idx % documents.length].id : undefined,
    linkedAssetId: idx % 2 === 0 ? assets[idx % assets.length].id : undefined,
    linkedTicketIds: [],
    linkedIpamIds: [],
    linkedNoteIds: [],
    linkedUserIds: [],
    completedAt: t.status === "done" ? daysAgo(1) : undefined,
    notes: "",
    createdAt: daysAgo(30 - idx),
    updatedAt: daysAgo(idx % 10),
  }));

  const taskViews: TaskSavedView[] = [
    { id: id("tvw"), name: "My open work", scope: "my", query: "", filters: { status: "open" } },
    { id: id("tvw"), name: "Critical & overdue", scope: "all", query: "", filters: { priority: "critical" } },
    { id: id("tvw"), name: "Team backlog", scope: "team", query: "", filters: { status: "open" } },
  ];

  const noteSeed = [
    { title: "AD replication issue notes", cat: "Active Directory" },
    { title: "Backup window adjustments", cat: "Backup" },
    { title: "Firewall maintenance log", cat: "Network" },
    { title: "M365 license rebalance", cat: "M365" },
    { title: "Quick disk replacement steps", cat: "Hardware" },
    { title: "VPN client troubleshooting", cat: "Network" },
    { title: "Hyper-V failover checklist", cat: "Virtualization" },
    { title: "Vendor contact list", cat: "General" },
  ];
  const notes: Note[] = noteSeed.map((n, idx) => ({
    id: id("nte"),
    title: n.title,
    category: n.cat,
    tags: [n.cat.toLowerCase()],
    pinned: idx < 2,
    archived: false,
    isTemplate: false,
    owner: owners[idx % owners.length],
    content: `# ${n.title}\n\nQuick reference note. Add details here.\n\n- Item 1\n- Item 2\n- Item 3\n\n## Notes\nUse **bold** or *italic* and \`inline code\` to organize ideas.`,
    linkedDocumentId: idx % 2 === 0 ? documents[idx % documents.length].id : undefined,
    linkedTicketIds: [],
    linkedAssetIds: [],
    linkedIpamIds: [],
    linkedTaskIds: [],
    linkedUserIds: [],
    createdAt: daysAgo(20 - idx),
    updatedAt: daysAgo(idx % 8),
  }));

  const noteTemplates: NoteTemplate[] = [
    { id: id("ntpl"), name: "Incident postmortem", category: "Security", content: "# Postmortem\n\n## Summary\n\n## Timeline\n- \n\n## Root cause\n\n## Action items\n- [ ] " },
    { id: id("ntpl"), name: "Change runbook", category: "Infrastructure", content: "# Change runbook\n\n## Scope\n\n## Pre-checks\n- [ ] \n\n## Steps\n1. \n\n## Rollback\n\n## Validation\n- [ ] " },
    { id: id("ntpl"), name: "Meeting notes", category: "General", content: "# Meeting notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action items\n- [ ] " },
    { id: id("ntpl"), name: "Troubleshooting log", category: "Network", content: "# Troubleshooting\n\n## Symptom\n\n## Environment\n\n## Hypotheses\n- \n\n## Findings\n\n## Resolution\n" },
  ];
  const teams = ["Service Desk", "Network", "Infrastructure", "Security", "Applications"];
  const requesters = ["alice.morgan", "ben.taylor", "carla.rivera", "david.kim", "evelyn.shaw", "felix.novak", "grace.huang", "henry.park", "isabella.ross"];
  const ticketSeed = [
    { sub: "Cannot connect to VPN", cat: "Network", sub2: "VPN", type: "incident", prio: "high", status: "open", sla: "warning", hostHint: "FIREWALL01", team: "Network", svc: "Remote Access" },
    { sub: "Outlook crashes on launch", cat: "Applications", sub2: "Email", type: "incident", prio: "normal", status: "in_progress", sla: "ok", hostHint: "M365-TENANT", team: "Service Desk", svc: "Email" },
    { sub: "New starter laptop request", cat: "Hardware", sub2: "Workstation", type: "request", prio: "normal", status: "open", sla: "ok", hostHint: undefined, team: "Service Desk", svc: "Onboarding" },
    { sub: "File share permissions error", cat: "Storage", sub2: "Shares", type: "incident", prio: "high", status: "waiting", sla: "ok", hostHint: "FILESERVER01", team: "Infrastructure", svc: "File Storage" },
    { sub: "DC01 disk space critical", cat: "Infrastructure", sub2: "Servers", type: "incident", prio: "critical", status: "in_progress", sla: "breached", hostHint: "DC01", team: "Infrastructure", svc: "Active Directory" },
    { sub: "Reset password for finance user", cat: "Identity", sub2: "Accounts", type: "request", prio: "low", status: "resolved", sla: "ok", hostHint: undefined, team: "Service Desk", svc: "Identity" },
    { sub: "Backup job failed overnight", cat: "Backup", sub2: "Veeam", type: "incident", prio: "high", status: "open", sla: "warning", hostHint: "BACKUP01", team: "Infrastructure", svc: "Backup" },
    { sub: "Phishing email reported", cat: "Security", sub2: "Email", type: "incident", prio: "high", status: "in_progress", sla: "ok", hostHint: "M365-TENANT", team: "Security", svc: "Email" },
    { sub: "Add VLAN 30 for IoT segment", cat: "Network", sub2: "VLAN", type: "change", prio: "normal", status: "open", sla: "ok", hostHint: "SWITCH-CORE-01", team: "Network", svc: "LAN" },
    { sub: "Printer offline on floor 2", cat: "Hardware", sub2: "Printer", type: "incident", prio: "low", status: "open", sla: "ok", hostHint: "PRINTSRV01", team: "Service Desk", svc: "Printing" },
    { sub: "Recurring AD replication warnings", cat: "Identity", sub2: "Directory", type: "problem", prio: "high", status: "in_progress", sla: "warning", hostHint: "DC02", team: "Infrastructure", svc: "Active Directory" },
    { sub: "Teams meeting audio issues", cat: "Applications", sub2: "Collaboration", type: "incident", prio: "normal", status: "waiting", sla: "ok", hostHint: "M365-TENANT", team: "Service Desk", svc: "Collaboration" },
    { sub: "SAN degraded disk replacement", cat: "Hardware", sub2: "Storage", type: "change", prio: "critical", status: "in_progress", sla: "warning", hostHint: "SANSTORAGE01", team: "Infrastructure", svc: "Storage" },
    { sub: "Install Adobe Acrobat", cat: "Applications", sub2: "Software", type: "request", prio: "low", status: "resolved", sla: "ok", hostHint: "WS-ADMIN-01", team: "Service Desk", svc: "Software" },
    { sub: "Suspicious login from foreign IP", cat: "Security", sub2: "Identity", type: "incident", prio: "critical", status: "open", sla: "breached", hostHint: undefined, team: "Security", svc: "Identity" },
    { sub: "Add user to Marketing group", cat: "Identity", sub2: "Groups", type: "request", prio: "low", status: "resolved", sla: "ok", hostHint: undefined, team: "Service Desk", svc: "Identity" },
    { sub: "Wi-Fi slow in conference room", cat: "Network", sub2: "Wi-Fi", type: "incident", prio: "normal", status: "open", sla: "ok", hostHint: "SWITCH-FLOOR2", team: "Network", svc: "Wi-Fi" },
    { sub: "Schedule monthly patching window", cat: "Infrastructure", sub2: "Patching", type: "change", prio: "normal", status: "open", sla: "ok", hostHint: "HYPERV01", team: "Infrastructure", svc: "Patching" },
  ];
  const statusToHours: Record<string, number> = { open: 4, in_progress: 12, waiting: 24, resolved: -8, closed: -24, cancelled: -1 };
  const tickets: Ticket[] = ticketSeed.map((t, idx) => {
    const linkedAsset = t.hostHint ? assets.find((a) => a.hostname === t.hostHint) : undefined;
    const linkedIp = linkedAsset ? ipam.find((p) => p.linkedAssetId === linkedAsset.id) : undefined;
    const createdHoursAgo = 2 + idx * 3;
    const created = new Date(Date.now() - createdHoursAgo * 3600_000).toISOString();
    const slaHours = statusToHours[t.status];
    const slaDue = new Date(Date.now() + slaHours * 3600_000).toISOString();
    const num = "INC-" + String(1024 + idx).padStart(5, "0");
    return {
      id: id("tkt"),
      number: num,
      subject: t.sub,
      description: `${t.sub}. Reported by ${requesters[idx % requesters.length]}. Initial triage in progress.`,
      requester: requesters[idx % requesters.length],
      type: t.type as Ticket["type"],
      category: t.cat,
      subcategory: t.sub2,
      priority: t.prio as Ticket["priority"],
      status: t.status as Ticket["status"],
      sla: t.sla as Ticket["sla"],
      slaDueAt: slaDue,
      affectedService: t.svc,
      assignee: idx % 5 === 0 ? undefined : owners[idx % owners.length],
      team: t.team,
      linkedAssetId: linkedAsset?.id,
      linkedIpamId: linkedIp?.id,
      tags: [t.cat.toLowerCase(), t.type],
      attachments: [],
      watchers: [requesters[(idx + 1) % requesters.length]],
      comments: [
        {
          id: id("cmt"),
          author: requesters[idx % requesters.length],
          body: t.sub,
          internal: false,
          createdAt: created,
        },
        ...(idx % 2 === 0
          ? [
              {
                id: id("cmt"),
                author: owners[idx % owners.length],
                body: "Investigating — will update shortly.",
                internal: true,
                createdAt: new Date(Date.now() - (createdHoursAgo - 1) * 3600_000).toISOString(),
              },
            ]
          : []),
      ],
      resolvedAt: t.status === "resolved" ? new Date(Date.now() - 2 * 3600_000).toISOString() : undefined,
      createdAt: created,
      updatedAt: new Date(Date.now() - Math.max(1, createdHoursAgo - 2) * 3600_000).toISOString(),
    };
  });
  // unused team list var safeguard
  void teams;


  const activity: ActivityLog[] = [
    { id: id("act"), type: "document.create", message: "Added document 'VPN User Guide'", createdAt: daysAgo(0) },
    { id: id("act"), type: "folder.create", message: "Created folder 'Firewall Rules'", createdAt: daysAgo(1) },
    { id: id("act"), type: "task.update", message: "Updated task 'Quarterly DR test'", createdAt: daysAgo(1) },
    { id: id("act"), type: "ipam.assign", message: "Assigned 192.168.0.40 to BACKUP01", createdAt: daysAgo(2) },
    { id: id("act"), type: "asset.edit", message: "Edited CMDB asset 'HYPERV01'", createdAt: daysAgo(2) },
    { id: id("act"), type: "note.create", message: "Created note 'Backup window adjustments'", createdAt: daysAgo(3) },
    { id: id("act"), type: "trash.restore", message: "Restored 'Old Network Diagram' from Recycle Bin", createdAt: daysAgo(4) },
    { id: id("act"), type: "document.update", message: "Updated 'AD Forest Design'", createdAt: daysAgo(5) },
  ];

  const notifications: NotificationItem[] = [
    { id: id("ntf"), title: "Certificate expires soon", message: "portal.acme.local expires in 2 days", type: "warning", createdAt: daysAgo(0) },
    { id: id("ntf"), title: "Backup job completed", message: "Nightly Veeam job finished successfully", type: "success", createdAt: daysAgo(0) },
    { id: id("ntf"), title: "Disk warning on SAN", message: "SANSTORAGE01 reports a degraded disk", type: "danger", createdAt: daysAgo(1) },
  ];

  const trash = [
    {
      id: id("trh"),
      kind: "document" as const,
      name: "Old Network Diagram v0.9",
      originalLocation: "02 - Network",
      payload: null,
      size: 22000,
      deletedAt: daysAgo(3),
    },
    {
      id: id("trh"),
      kind: "ipam" as const,
      name: "192.168.0.250",
      originalLocation: "IPAM",
      payload: null,
      size: 200,
      deletedAt: daysAgo(6),
    },
  ];

  const settings: AppSettings = {
    appName: "IT Knowledge Center",
    version: "2.0 Prototype",
    compactMode: false,
    tablePageSize: 10,
    showNotifications: true,
    sidebarCollapsed: false,
    defaultDocView: "table",
    showDashboardChart: true,
    reducedMotion: false,
  };

  return {
    folders,
    documents,
    assets,
    ipam,
    tasks,
    notes,
    tickets,
    ticketViews: [
      { id: id("vw"), name: "My open tickets", query: "", filters: { assignee: owners[0], status: "open" } },
      { id: id("vw"), name: "SLA at risk", query: "", filters: { sla: "warning" } },
      { id: id("vw"), name: "Critical incidents", query: "", filters: { priority: "critical", type: "incident" } },
    ],
    catalog: [
      { id: id("cat"), name: "New laptop request", category: "Hardware", icon: "Laptop", description: "Standard issue Windows 11 laptop with imaging and software baseline.", estimatedTime: "3 business days", defaultPriority: "normal", defaultTeam: "Service Desk", fields: [
        { key: "justification", label: "Business justification", type: "textarea", required: true, placeholder: "Why is this device required?" },
        { key: "model", label: "Preferred model", type: "select", options: ["Standard 14\"", "Standard 15\"", "Performance 16\""], required: true },
        { key: "deliveryDate", label: "Needed by", type: "date" },
      ]},
      { id: id("cat"), name: "Password reset", category: "Identity", icon: "KeyRound", description: "Reset corporate Active Directory password.", estimatedTime: "15 minutes", defaultPriority: "high", defaultTeam: "Service Desk", fields: [
        { key: "account", label: "Account to reset", type: "text", required: true, placeholder: "samAccountName or email" },
        { key: "reason", label: "Reason", type: "textarea" },
      ]},
      { id: id("cat"), name: "Software install", category: "Applications", icon: "Package", description: "Request installation of an approved software package.", estimatedTime: "1 business day", defaultPriority: "normal", defaultTeam: "Service Desk", fields: [
        { key: "software", label: "Software name", type: "text", required: true },
        { key: "device", label: "Device hostname", type: "text", required: true },
      ]},
      { id: id("cat"), name: "VPN access", category: "Network", icon: "Globe", description: "Provision remote VPN access for a corporate account.", estimatedTime: "2 business days", defaultPriority: "normal", defaultTeam: "Network", fields: [
        { key: "duration", label: "Access duration", type: "select", options: ["Permanent", "30 days", "90 days"], required: true },
        { key: "reason", label: "Reason for access", type: "textarea", required: true },
      ]},
      { id: id("cat"), name: "New user onboarding", category: "Onboarding", icon: "UserPlus", description: "Provision account, mailbox, group memberships, and device.", estimatedTime: "5 business days", defaultPriority: "high", defaultTeam: "Service Desk", fields: [
        { key: "fullName", label: "Full name", type: "text", required: true },
        { key: "manager", label: "Reporting manager", type: "text", required: true },
        { key: "startDate", label: "Start date", type: "date", required: true },
        { key: "department", label: "Department", type: "select", options: ["Finance", "HR", "Engineering", "Sales", "Operations"], required: true },
      ]},
      { id: id("cat"), name: "Shared mailbox", category: "Applications", icon: "Mail", description: "Create a new shared mailbox in Microsoft 365.", estimatedTime: "1 business day", defaultPriority: "normal", defaultTeam: "Applications", fields: [
        { key: "name", label: "Mailbox name", type: "text", required: true },
        { key: "members", label: "Initial members", type: "textarea", placeholder: "One per line" },
      ]},
      { id: id("cat"), name: "Distribution group", category: "Identity", icon: "Users", description: "Create a new email distribution group.", estimatedTime: "4 hours", defaultPriority: "low", defaultTeam: "Service Desk", fields: [
        { key: "groupName", label: "Group name", type: "text", required: true },
        { key: "owner", label: "Group owner", type: "text", required: true },
      ]},
      { id: id("cat"), name: "Printer setup", category: "Hardware", icon: "Printer", description: "Configure or install an office printer.", estimatedTime: "1 business day", defaultPriority: "low", defaultTeam: "Service Desk", fields: [
        { key: "location", label: "Office location", type: "text", required: true },
        { key: "model", label: "Printer model", type: "text" },
      ]},
      { id: id("cat"), name: "Conference room AV", category: "Hardware", icon: "Tv", description: "Report or request audio/visual setup for a meeting room.", estimatedTime: "Same day", defaultPriority: "high", defaultTeam: "Service Desk", fields: [
        { key: "room", label: "Conference room", type: "text", required: true },
        { key: "issue", label: "Issue or request", type: "textarea", required: true },
      ]},
      { id: id("cat"), name: "Security incident report", category: "Security", icon: "ShieldAlert", description: "Report a suspected phishing, malware, or unauthorized access event.", estimatedTime: "Immediate", defaultPriority: "critical", defaultTeam: "Security", fields: [
        { key: "summary", label: "What happened?", type: "textarea", required: true },
        { key: "affectedAccounts", label: "Affected accounts or devices", type: "text" },
      ]},
    ],
    ticketSettings: {
      categories: ["Network", "Applications", "Hardware", "Storage", "Infrastructure", "Identity", "Security", "Backup", "Other"],
      teams: ["Service Desk", "Network", "Infrastructure", "Security", "Applications"],
      statuses: ["open", "in_progress", "waiting", "resolved", "closed", "cancelled"],
      priorities: ["low", "normal", "high", "critical"],
      slaPolicies: [
        { id: id("sla"), priority: "critical", responseMinutes: 15, resolveMinutes: 240 },
        { id: id("sla"), priority: "high", responseMinutes: 60, resolveMinutes: 480 },
        { id: id("sla"), priority: "normal", responseMinutes: 240, resolveMinutes: 1440 },
        { id: id("sla"), priority: "low", responseMinutes: 480, resolveMinutes: 4320 },
      ],
      routingRules: [
        { id: id("rr"), category: "Network", team: "Network" },
        { id: id("rr"), category: "Security", team: "Security" },
        { id: id("rr"), category: "Infrastructure", team: "Infrastructure" },
        { id: id("rr"), category: "Applications", team: "Applications" },
        { id: id("rr"), category: "Hardware", team: "Service Desk" },
        { id: id("rr"), category: "Identity", team: "Service Desk" },
        { id: id("rr"), category: "Backup", team: "Infrastructure" },
      ],
    },
    trash,
    activity,
    snapshots: [],
    notifications,
    settings,
  };
}
