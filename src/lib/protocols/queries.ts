import { queryOptions } from "@tanstack/react-query";
import { listProtocolRuns, listProtocolTemplates } from "./protocols";

export const protocolTemplatesKeys = {
  all: ["protocolTemplates"] as const,
  list: (includeDeleted: boolean) => [...protocolTemplatesKeys.all, "list", { includeDeleted }] as const,
};

export const protocolTemplatesQuery = (includeDeleted = false) => queryOptions({
  queryKey: protocolTemplatesKeys.list(includeDeleted),
  queryFn: () => listProtocolTemplates(includeDeleted),
});

export const protocolRunsKeys = {
  all: ["protocolRuns"] as const,
  list: () => [...protocolRunsKeys.all, "list"] as const,
};

export const protocolRunsQuery = () => queryOptions({
  queryKey: protocolRunsKeys.list(),
  queryFn: () => listProtocolRuns(),
});
