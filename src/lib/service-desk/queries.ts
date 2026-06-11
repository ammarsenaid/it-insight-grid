/**
 * Service Desk — TanStack Query options factories.
 *
 * Components and route loaders read through these so we keep a single
 * source of truth for queryKey shapes and stale times.
 */
import { queryOptions } from "@tanstack/react-query";

import { listPublishedCatalog, listAllCatalogForManagers, getCatalogItem } from "./catalog";
import { listTicketComments } from "./comments";
import {
  getTicket,
  listAssignmentHistory,
  listMyTickets,
  listStatusEvents,
  listTickets,
} from "./tickets";
import { listTicketAttachments } from "./attachments";
import { listMyNotifications, countUnreadNotifications } from "./notifications";
import {
  listCannedResponses,
  listCategories,
  listMailboxConfigs,
  listPriorityConfigs,
  listRoutingRules,
  listSlaPolicies,
} from "./settings";
import { listProfiles } from "./profiles";


export const sdKeys = {
  all: ["service-desk"] as const,
  catalogPublished: () => [...sdKeys.all, "catalog", "published"] as const,
  catalogManaged: () => [...sdKeys.all, "catalog", "managed"] as const,
  catalogItem: (id: string) => [...sdKeys.all, "catalog", "item", id] as const,
  tickets: () => [...sdKeys.all, "tickets"] as const,
  ticketsMine: (userId: string) => [...sdKeys.all, "tickets", "mine", userId] as const,
  ticket: (id: string) => [...sdKeys.all, "ticket", id] as const,
  ticketComments: (id: string) => [...sdKeys.all, "ticket", id, "comments"] as const,
  ticketAttachments: (id: string) => [...sdKeys.all, "ticket", id, "attachments"] as const,
  ticketStatus: (id: string) => [...sdKeys.all, "ticket", id, "status-events"] as const,
  ticketAssignments: (id: string) => [...sdKeys.all, "ticket", id, "assignments"] as const,
  notifications: () => [...sdKeys.all, "notifications"] as const,
  notificationsUnread: () => [...sdKeys.all, "notifications", "unread-count"] as const,
  settings: {
    categories: () => [...sdKeys.all, "settings", "categories"] as const,
    priorities: () => [...sdKeys.all, "settings", "priorities"] as const,
    sla: () => [...sdKeys.all, "settings", "sla"] as const,
    routing: () => [...sdKeys.all, "settings", "routing"] as const,
    canned: () => [...sdKeys.all, "settings", "canned"] as const,
    mailbox: () => [...sdKeys.all, "settings", "mailbox"] as const,
  },
};

export const catalogPublishedQuery = () =>
  queryOptions({
    queryKey: sdKeys.catalogPublished(),
    queryFn: () => listPublishedCatalog(),
  });

export const catalogManagedQuery = () =>
  queryOptions({
    queryKey: sdKeys.catalogManaged(),
    queryFn: () => listAllCatalogForManagers(),
  });

export const catalogItemQuery = (id: string) =>
  queryOptions({
    queryKey: sdKeys.catalogItem(id),
    queryFn: () => getCatalogItem(id),
  });

export const ticketsQuery = () =>
  queryOptions({
    queryKey: sdKeys.tickets(),
    queryFn: () => listTickets(),
  });

export const myTicketsQuery = (userId: string) =>
  queryOptions({
    queryKey: sdKeys.ticketsMine(userId),
    queryFn: () => listMyTickets(userId),
    enabled: Boolean(userId),
  });

export const ticketQuery = (id: string) =>
  queryOptions({
    queryKey: sdKeys.ticket(id),
    queryFn: () => getTicket(id),
  });

export const ticketCommentsQuery = (id: string) =>
  queryOptions({
    queryKey: sdKeys.ticketComments(id),
    queryFn: () => listTicketComments(id),
  });

export const ticketAttachmentsQuery = (id: string) =>
  queryOptions({
    queryKey: sdKeys.ticketAttachments(id),
    queryFn: () => listTicketAttachments(id),
  });

export const ticketStatusEventsQuery = (id: string) =>
  queryOptions({
    queryKey: sdKeys.ticketStatus(id),
    queryFn: () => listStatusEvents(id),
  });

export const ticketAssignmentHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: sdKeys.ticketAssignments(id),
    queryFn: () => listAssignmentHistory(id),
  });

export const notificationsQuery = (limit = 100) =>
  queryOptions({
    queryKey: [...sdKeys.notifications(), limit] as const,
    queryFn: () => listMyNotifications(limit),
  });

export const unreadNotificationsQuery = () =>
  queryOptions({
    queryKey: sdKeys.notificationsUnread(),
    queryFn: () => countUnreadNotifications(),
  });

export const ticketCategoriesQuery = () =>
  queryOptions({
    queryKey: sdKeys.settings.categories(),
    queryFn: () => listCategories(),
  });

export const ticketPriorityConfigsQuery = () =>
  queryOptions({
    queryKey: sdKeys.settings.priorities(),
    queryFn: () => listPriorityConfigs(),
  });

export const slaPoliciesQuery = () =>
  queryOptions({
    queryKey: sdKeys.settings.sla(),
    queryFn: () => listSlaPolicies(),
  });

export const routingRulesQuery = () =>
  queryOptions({
    queryKey: sdKeys.settings.routing(),
    queryFn: () => listRoutingRules(),
  });

export const cannedResponsesQuery = () =>
  queryOptions({
    queryKey: sdKeys.settings.canned(),
    queryFn: () => listCannedResponses(),
  });

export const mailboxConfigsQuery = () =>
  queryOptions({
    queryKey: sdKeys.settings.mailbox(),
    queryFn: () => listMailboxConfigs(),
  });
