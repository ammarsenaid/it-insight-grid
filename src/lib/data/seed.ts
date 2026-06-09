import type {
  DataState,
  Folder,
  Document,
  CMDBAsset,
  IPAMEntry,
  Task,
  Note,
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
    category: t.cat,
    priority: t.prio as Task["priority"],
    status: t.status as Task["status"],
    dueDate: t.due,
    assignedTo: owners[idx % owners.length],
    linkedDocumentId: idx % 3 === 0 ? documents[idx % documents.length].id : undefined,
    linkedAssetId: idx % 2 === 0 ? assets[idx % assets.length].id : undefined,
    notes: "",
    createdAt: daysAgo(30 - idx),
    updatedAt: daysAgo(idx % 10),
  }));

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
    content: `# ${n.title}\n\nQuick reference note. Add details here.\n\n- Item 1\n- Item 2\n- Item 3`,
    linkedDocumentId: idx % 2 === 0 ? documents[idx % documents.length].id : undefined,
    createdAt: daysAgo(20 - idx),
    updatedAt: daysAgo(idx % 8),
  }));

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
    trash,
    activity,
    snapshots: [],
    notifications,
    settings,
  };
}
