import { queryOptions } from "@tanstack/react-query";
import { listAssetLifecycle, listAssets, listAssetTypes } from "./assets";

export const cmdbKeys = {
  all: ["cmdb"] as const,
  assets: (includeDeleted: boolean) => [...cmdbKeys.all, "assets", { includeDeleted }] as const,
  assetTypes: () => [...cmdbKeys.all, "asset-types"] as const,
  lifecycle: (assetId: string) => [...cmdbKeys.all, "asset", assetId, "lifecycle"] as const,
};

export const cmdbAssetsQuery = (includeDeleted = false) => queryOptions({
  queryKey: cmdbKeys.assets(includeDeleted),
  queryFn: () => listAssets(includeDeleted),
});

export const cmdbAssetTypesQuery = () => queryOptions({
  queryKey: cmdbKeys.assetTypes(),
  queryFn: listAssetTypes,
  staleTime: 5 * 60_000,
});

export const cmdbLifecycleQuery = (assetId: string) => queryOptions({
  queryKey: cmdbKeys.lifecycle(assetId),
  queryFn: () => listAssetLifecycle(assetId),
  enabled: Boolean(assetId),
});
