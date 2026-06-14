import { cmdbKeys, cmdbAssetsQuery } from "@/lib/cmdb/queries";
import { ipamKeys, ipamAddressesQuery } from "@/lib/ipam/queries";
import { tasksKeys, tasksQuery } from "@/lib/tasks/queries";
import { notesKeys, notesQuery } from "@/lib/notes/queries";
import type { RecycleBinKind } from "./types";

export const recycleBinDeletedAssetsQuery = () => cmdbAssetsQuery(true);
export const recycleBinDeletedAddressesQuery = () => ipamAddressesQuery(true);
export const recycleBinDeletedTasksQuery = () => tasksQuery(true);
export const recycleBinDeletedNotesQuery = () => notesQuery(true);

export const recycleBinInvalidationKeys: Record<RecycleBinKind, readonly unknown[]> = {
  asset: cmdbKeys.all,
  ipam: ipamKeys.all,
  task: tasksKeys.all,
  note: notesKeys.all,
};
