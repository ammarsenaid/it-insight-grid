import { queryOptions } from "@tanstack/react-query";
import { listIpamAddresses, listIpamNetworks, listIpamSubnets } from "./addresses";

export const ipamKeys = {
  all: ["ipam"] as const,
  addresses: (includeDeleted: boolean) => [...ipamKeys.all, "addresses", { includeDeleted }] as const,
  networks: (includeDeleted: boolean) => [...ipamKeys.all, "networks", { includeDeleted }] as const,
  subnets: (includeDeleted: boolean) => [...ipamKeys.all, "subnets", { includeDeleted }] as const,
};

export const ipamAddressesQuery = (includeDeleted = false) => queryOptions({
  queryKey: ipamKeys.addresses(includeDeleted),
  queryFn: () => listIpamAddresses(includeDeleted),
});

export const ipamNetworksQuery = (includeDeleted = false) => queryOptions({
  queryKey: ipamKeys.networks(includeDeleted),
  queryFn: () => listIpamNetworks(includeDeleted),
});

export const ipamSubnetsQuery = (includeDeleted = false) => queryOptions({
  queryKey: ipamKeys.subnets(includeDeleted),
  queryFn: () => listIpamSubnets(includeDeleted),
});
