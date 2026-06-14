// Tiny CSV utilities for frontend-only export / import preview.

export function toCSV(rows: Record<string, unknown>[], headers?: string[]): string {
  if (rows.length === 0) return (headers ?? []).join(",");
  const cols = headers ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  if (source.length === 0) return { headers: [], rows: [] };

  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      if (character === "\r" && source[index + 1] === "\n") index++;
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("Malformed CSV: unterminated quoted field");
  if (field.length > 0 || record.length > 0 || !/[\r\n]$/.test(source)) {
    record.push(field);
    records.push(record);
  }

  const nonBlankRecords = records.filter((cells) => cells.length !== 1 || cells[0] !== "");
  if (nonBlankRecords.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRecords] = nonBlankRecords;
  const rows = dataRecords.map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => { obj[header] = cells[index] ?? ""; });
    return obj;
  });
  return { headers, rows };
}
