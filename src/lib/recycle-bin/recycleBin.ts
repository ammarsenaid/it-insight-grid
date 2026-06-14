import type { CmdbAsset } from "@/lib/cmdb/types";
import { restoreAsset } from "@/lib/cmdb/assets";
import type { IpamAddress } from "@/lib/ipam/types";
import { restoreIpamAddress } from "@/lib/ipam/addresses";
import type { Task } from "@/lib/tasks/types";
import { restoreTask } from "@/lib/tasks/tasks";
import type { Note } from "@/lib/notes/types";
import { restoreNote } from "@/lib/notes/notes";
import type { RecycleBinItem } from "./types";

export function assetsToRecycleBinItems(assets: CmdbAsset[]): RecycleBinItem[] {
  return assets
    .filter((asset) => asset.deletedAt)
    .map((asset) => ({
      id: asset.id,
      kind: "asset",
      name: asset.displayName || asset.hostname || asset.assetTag || asset.id,
      originalLocation: "CMDB / Assets",
      deletedAt: asset.deletedAt as string,
    }));
}

export function addressesToRecycleBinItems(addresses: IpamAddress[]): RecycleBinItem[] {
  return addresses
    .filter((address) => address.deletedAt)
    .map((address) => ({
      id: address.id,
      kind: "ipam",
      name: address.ipAddress || address.hostname || address.id,
      originalLocation: address.subnet ? `IPAM / ${address.subnet}` : "IPAM / Addresses",
      deletedAt: address.deletedAt as string,
    }));
}

export function tasksToRecycleBinItems(tasks: Task[]): RecycleBinItem[] {
  return tasks
    .filter((task) => task.deletedAt)
    .map((task) => ({
      id: task.id,
      kind: "task",
      name: task.title,
      originalLocation: task.category ? `Tasks / ${task.category}` : "Tasks",
      deletedAt: task.deletedAt as string,
    }));
}

export function notesToRecycleBinItems(notes: Note[]): RecycleBinItem[] {
  return notes
    .filter((note) => note.deletedAt)
    .map((note) => ({
      id: note.id,
      kind: "note",
      name: note.title,
      originalLocation: note.category ? `Notes / ${note.category}` : "Notes",
      deletedAt: note.deletedAt as string,
    }));
}

export function restoreRecycleBinItem(item: RecycleBinItem): Promise<void> {
  switch (item.kind) {
    case "asset":
      return restoreAsset(item.id);
    case "ipam":
      return restoreIpamAddress(item.id);
    case "task":
      return restoreTask(item.id);
    case "note":
      return restoreNote(item.id);
  }
}
