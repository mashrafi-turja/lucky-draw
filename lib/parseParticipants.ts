import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedRow = { name: string; division: string; phone: string };

// "Phone Number", "phone_number", "Mobile" ... all map to the same key
function key(h: string) {
  return h.trim().toLowerCase().replace(/[\s_\-.]+/g, "");
}

const PHONE_KEYS = ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber", "cell"];

function cleanPhone(v: unknown): string {
  let s = String(v ?? "").trim().replace(/[\s\-()]/g, "");
  if (!s) return "";
  // Excel drops the leading 0 of numbers stored as numeric cells
  // (01712345678 -> 1712345678). Restore it for 10-digit BD mobiles.
  if (/^1\d{9}$/.test(s)) s = "0" + s;
  return s;
}

function rowsFromObjects(objs: Record<string, any>[]): ParsedRow[] {
  return objs
    .map((row) => {
      const entries: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) entries[key(k)] = v;

      const phoneKey = PHONE_KEYS.find((k) => entries[k] !== undefined && String(entries[k]).trim() !== "");
      return {
        name: String(entries["name"] ?? "").trim(),
        division: String(entries["division"] ?? "").trim(),
        phone: phoneKey ? cleanPhone(entries[phoneKey]) : "",
      };
    })
    .filter((r) => r.name && r.division);
}

export async function parseParticipantFile(file: File): Promise<ParsedRow[]> {
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  if (isCsv) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
    return rowsFromObjects(parsed.data);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: "" });
  return rowsFromObjects(json);
}
