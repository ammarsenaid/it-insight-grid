import { queryOptions } from "@tanstack/react-query";
import { listAdminRolesData } from "./admin-roles";

export const adminRolesKeys = {
  all: ["admin-roles"] as const,
  matrix: () => [...adminRolesKeys.all, "matrix"] as const,
};

export const adminRolesQuery = () =>
  queryOptions({
    queryKey: adminRolesKeys.matrix(),
    queryFn: listAdminRolesData,
  });
