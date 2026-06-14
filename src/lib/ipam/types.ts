export type IpamAddressType = "static" | "dhcp" | "virtual";
export type IpamAllocationState = "free" | "allocated" | "reserved";

export interface IpamNetwork {
  id: string;
  name: string;
  cidr: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface IpamSubnet {
  id: string;
  networkId: string;
  networkName: string;
  cidr: string;
  gateway: string;
  vlan: string;
  location: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface IpamAddress {
  id: string;
  subnetId: string;
  subnet: string;
  networkId: string;
  networkName: string;
  networkCidr: string;
  ipAddress: string;
  hostname: string;
  type: IpamAddressType;
  allocationState: IpamAllocationState;
  gateway: string;
  vlan: string;
  location: string;
  linkedAssetId: string | null;
  linkedAssetHostname: string;
  reservationId: string | null;
  reservationName: string;
  reservationExpiresAt: string | null;
  reservationNotes: string;
  notes: string;
  conflictReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface IpamAddressInput {
  networkName: string;
  networkCidr: string;
  subnet: string;
  gateway: string;
  vlan: string;
  location: string;
  ipAddress: string;
  hostname: string;
  type: IpamAddressType;
  allocationState: IpamAllocationState;
  linkedAssetId?: string | null;
  reservationName?: string;
  reservationExpiresAt?: string | null;
  reservationNotes?: string;
  notes: string;
}
