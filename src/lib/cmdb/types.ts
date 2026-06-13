export type CmdbAssetStatus = "active" | "maintenance" | "retired";
export type CmdbEnvironment = "production" | "staging" | "development";

export interface CmdbAssetType {
  id: string;
  key: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface CmdbAsset {
  id: string;
  hostname: string;
  displayName: string;
  assetTypeId: string;
  assetType: string;
  ipAddress: string;
  os: string;
  role: string;
  environment: CmdbEnvironment;
  location: string;
  owner: string;
  ownerId: string | null;
  vendor: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  macAddress: string;
  status: CmdbAssetStatus;
  warrantyExpiration?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface CmdbAssetInput {
  hostname: string;
  displayName: string;
  assetTypeId: string;
  ipAddress: string;
  os: string;
  role: string;
  environment: CmdbEnvironment;
  location: string;
  owner: string;
  ownerId?: string | null;
  vendor: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  macAddress: string;
  status: CmdbAssetStatus;
  warrantyExpiration?: string;
  notes: string;
}

export interface CmdbLifecycleEvent {
  id: string;
  eventType: "created" | "updated" | "status_changed" | "ownership_changed" | "deleted" | "restored";
  fromStatus: CmdbAssetStatus | null;
  toStatus: CmdbAssetStatus | null;
  fromOwner: string | null;
  toOwner: string | null;
  actorId: string | null;
  createdAt: string;
}
