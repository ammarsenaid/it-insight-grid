#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"

bun -e '
import { parseCSV, toCSV } from "./src/lib/csv.ts";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const roundTrip = (row: Record<string, unknown>, headers: string[]) => {
  const parsed = parseCSV(toCSV([row], headers));
  assert(JSON.stringify(parsed.headers) === JSON.stringify(headers), "headers changed during round trip");
  return parsed.rows[0];
};

assert(roundTrip({ a: "one", b: "two" }, ["a", "b"]).b === "two", "simple CSV failed");
assert(roundTrip({ value: "one,two" }, ["value"]).value === "one,two", "comma field failed");
assert(roundTrip({ value: `say "hello"` }, ["value"]).value === `say "hello"`, "escaped quote failed");
assert(roundTrip({ notes: "line one\nline two" }, ["notes"]).notes === "line one\nline two", "LF multiline failed");

const crlf = parseCSV("notes\r\n\"line one\r\nline two\"\r\n");
assert(crlf.rows[0].notes === "line one\r\nline two", "CRLF multiline failed");

const trailing = parseCSV("first,second,third\n1,2,");
assert(trailing.rows[0].third === "", "trailing empty field failed");

const bom = parseCSV("\uFEFFfirst,second\n1,2");
assert(bom.headers[0] === "first" && bom.rows[0].second === "2", "UTF-8 BOM failed");

let malformedRejected = false;
try {
  parseCSV(`first,second\n1,"unterminated`);
} catch (error) {
  malformedRejected = error instanceof Error && error.message.includes("unterminated quoted field");
}
assert(malformedRejected, "unterminated quoted field was not rejected");

const ipamHeaders = [
  "ipAddress", "hostname", "type", "networkName", "networkCidr", "subnet",
  "gateway", "vlan", "location", "allocationState", "linkedAssetId",
  "reservationName", "reservationExpiresAt", "reservationNotes", "notes",
];
const allocated = roundTrip({
  ipAddress: "10.20.1.20/32", hostname: "qa-allocated", type: "static",
  networkName: "QA Network", networkCidr: "10.20.0.0/16", subnet: "10.20.1.0/24",
  gateway: "10.20.1.1/32", vlan: "VLAN 20", location: "QA DC",
  allocationState: "allocated", linkedAssetId: "00000000-0000-0000-0000-000000000001",
  reservationName: "", reservationExpiresAt: "", reservationNotes: "",
  notes: "address, note with \"quotes\"",
}, ipamHeaders);
assert(allocated.linkedAssetId.endsWith("0001"), "allocated IPAM row failed");

const reserved = roundTrip({
  ipAddress: "10.20.1.21/32", hostname: "qa-reserved", type: "static",
  networkName: "QA Network", networkCidr: "10.20.0.0/16", subnet: "10.20.1.0/24",
  gateway: "10.20.1.1/32", vlan: "VLAN 20", location: "QA DC",
  allocationState: "reserved", linkedAssetId: "", reservationName: "QA reservation",
  reservationExpiresAt: "2030-01-02T03:04:05Z",
  reservationNotes: "first reservation line\nsecond reservation line", notes: "reserved note",
}, ipamHeaders);
assert(reserved.reservationNotes.includes("\n"), "reserved multiline IPAM row failed");

console.log("CSV parser round-trip assertions passed.");
'
