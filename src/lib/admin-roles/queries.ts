import { queryOptions } from "@tanstack/react-query";
import { listAdminRolePageVisibility, listAdminRolesData } from "./admin-roles";

export const adminRolesKeys = {
  all: ["admin-roles"] as const,
  matrix: () => [...adminRolesKeys.all, "matrix"] as const,
  pageVisibility: () => [...adminRolesKeys.all, "page-visibility"] as const,
};

export const adminRolesQuery = () =>
  queryOptions({
    queryKey: adminRolesKeys.matrix(),
    queryFn: listAdminRolesData,
  });

export const adminRolePageVisibilityQuery = () =>
  queryOptions({
    queryKey: adminRolesKeys.pageVisibility(),
    queryFn: listAdminRolePageVisibility,
  });
