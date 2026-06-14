import { queryOptions } from "@tanstack/react-query";
import { listTasks } from "./tasks";

export const tasksKeys = {
  all: ["tasks"] as const,
  list: (includeDeleted: boolean) => [...tasksKeys.all, "list", { includeDeleted }] as const,
};

export const tasksQuery = (includeDeleted = false) => queryOptions({
  queryKey: tasksKeys.list(includeDeleted),
  queryFn: () => listTasks(includeDeleted),
});
