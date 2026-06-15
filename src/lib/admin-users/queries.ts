import { queryOptions } from "@tanstack/react-query";
import { listAdminUserFormOptions, listAdminUsers } from "./admin-users";

export const adminUsersKeys = {
  all: ["admin-users"] as const,
  list: () => [...adminUsersKeys.all, "list"] as const,
  formOptions: () => [...adminUsersKeys.all, "form-options"] as const,
};

export const adminUsersQuery = () =>
  queryOptions({
    queryKey: adminUsersKeys.list(),
    queryFn: listAdminUsers,
  });

export const adminUserFormOptionsQuery = () =>
  queryOptions({
    queryKey: adminUsersKeys.formOptions(),
    queryFn: listAdminUserFormOptions,
  });
