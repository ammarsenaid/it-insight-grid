import type { KnowledgeTemplate } from "./types";

export const TEMPLATES: KnowledgeTemplate[] = [
  {
    id: "tpl_blank",
    name: "Blank Page",
    category: "General",
    description: "Start from scratch.",
    content: "# Untitled\n\nStart writing here…",
  },
  {
    id: "tpl_sop",
    name: "Standard Operating Procedure",
    category: "Operations",
    description: "Structured SOP with purpose, scope, and steps.",
    content: `# Purpose

Describe why this procedure exists.

## Scope

Who and what this applies to.

## Roles & Responsibilities

- **Owner:** 
- **Reviewer:** 

## Procedure

1. Step one
2. Step two
3. Step three

## Verification

How to confirm success.

## Related Documentation

- 
`,
  },
  {
    id: "tpl_troubleshooting",
    name: "Troubleshooting Guide",
    category: "Support",
    description: "Symptom → cause → resolution format.",
    content: `# Problem Summary

Short description of the issue.

## Symptoms

- 

## Affected Systems

- 

## Possible Causes

1. 
2. 

## Diagnostic Steps

1. 
2. 

## Resolution Steps

1. 
2. 

## Verification

- [ ] Service responds
- [ ] Logs are clean

## Related Documentation

- 
`,
  },
  {
    id: "tpl_server",
    name: "Server Documentation",
    category: "Infrastructure",
    description: "Document a server, its role, and ownership.",
    content: `# Server Overview

| Field | Value |
| --- | --- |
| Hostname | |
| IP Address | |
| OS | |
| Role | |
| Owner | |
| Environment | |

## Purpose

## Configuration

## Backup Strategy

## Monitoring

## Runbook

## Related Records
`,
  },
  {
    id: "tpl_app",
    name: "Application Documentation",
    category: "Applications",
    description: "Describe a business or internal application.",
    content: `# Application Overview

## Owner & Stakeholders

## Architecture

## Dependencies

## Access & Roles

## Operational Notes

## Support Contacts
`,
  },
  {
    id: "tpl_network",
    name: "Network Documentation",
    category: "Networking",
    description: "Network segment / device documentation.",
    content: `# Network Segment

## Topology

## VLANs

| VLAN | Subnet | Purpose |
| --- | --- | --- |
|  |  |  |

## Routing

## Firewall Rules

## Change History
`,
  },
  {
    id: "tpl_security",
    name: "Security Procedure",
    category: "Security",
    description: "Security control or procedure.",
    content: `# Security Control

## Objective

## Scope

## Controls

- 

## Verification

## Incident Handling

## Related Policies
`,
  },
  {
    id: "tpl_backup",
    name: "Backup & Recovery Procedure",
    category: "Operations",
    description: "Backup target and recovery runbook.",
    content: `# Backup & Recovery

## Backup Targets

## Schedule

## Retention

## Restore Procedure

1. 
2. 

## Test Plan
`,
  },
  {
    id: "tpl_onboarding",
    name: "Onboarding Checklist",
    category: "People",
    description: "New-hire IT checklist.",
    content: `# IT Onboarding

## Day 0

- [ ] Account created
- [ ] Mailbox provisioned
- [ ] Laptop prepared

## Day 1

- [ ] Microsoft 365 access verified
- [ ] VPN tested
- [ ] Welcome briefing

## Week 1

- [ ] Department tools installed
- [ ] Security training assigned
`,
  },
  {
    id: "tpl_howto",
    name: "How-To Guide",
    category: "Support",
    description: "Task-oriented walkthrough.",
    content: `# How to …

## Prerequisites

## Steps

1. 
2. 
3. 

## Result

## Troubleshooting
`,
  },
  {
    id: "tpl_meeting",
    name: "Meeting Notes",
    category: "General",
    description: "Standard meeting notes template.",
    content: `# Meeting Notes — YYYY-MM-DD

## Attendees

## Agenda

- 

## Decisions

- 

## Action Items

- [ ] @owner — task
`,
  },
  {
    id: "tpl_postmortem",
    name: "Incident Postmortem",
    category: "Incident",
    description: "Blameless postmortem.",
    content: `# Incident Postmortem

## Summary

## Timeline

| Time | Event |
| --- | --- |
|  |  |

## Impact

## Root Cause

## Resolution

## What Went Well

## What Went Poorly

## Action Items

- [ ] 
`,
  },
  {
    id: "tpl_change",
    name: "Change Documentation",
    category: "Change",
    description: "Document a planned change.",
    content: `# Change

## Description

## Risk

## Rollback Plan

## Test Plan

## Approvals

## Implementation Steps

1. 
2. 
`,
  },
  {
    id: "tpl_runbook",
    name: "Runbook",
    category: "Operations",
    description: "Operational runbook for a system.",
    content: `# Runbook — <System>

## Health Check

## Common Alerts

| Alert | Diagnostic | Mitigation |
| --- | --- | --- |
|  |  |  |

## Restart Procedures

## Escalation Path
`,
  },
];
