import { queryOptions } from "@tanstack/react-query";
import { listAdminUsers } from "./admin-users";

export const adminUsersKeys = {
  all: ["admin-users"] as const,
  list: () => [...adminUsersKeys.all, "list"] as const,
};

export const adminUsersQuery = () =>
  queryOptions({
    queryKey: adminUsersKeys.list(),
    queryFn: listAdminUsers,
  });
