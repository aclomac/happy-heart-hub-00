import { describe, it, expect } from "vitest";
import { escapeCsvField, toCsv, csvBlob, type CsvColumn } from "@/lib/export/csv";

describe("escapeCsvField", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("quotes fields containing commas", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(escapeCsvField('he said "hi"')).toBe('"he said ""hi"""');
  });

  it("quotes fields with newlines (LF and CRLF)", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("preserves Bangla / unicode characters as-is", () => {
    expect(escapeCsvField("বাংলা")).toBe("বাংলা");
    expect(escapeCsvField("বাংলা, টেক্সট")).toBe('"বাংলা, টেক্সট"');
  });

  it("guards against spreadsheet formula injection", () => {
    expect(escapeCsvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvField("+1+1")).toBe("'+1+1");
    expect(escapeCsvField("-cmd")).toBe("'-cmd");
    expect(escapeCsvField("@evil")).toBe("'@evil");
  });
});

describe("toCsv", () => {
  type Row = { name: string; qty: number; note: string | null };
  const cols: CsvColumn<Row>[] = [
    { key: "name", label: "Name" },
    { key: "qty", label: "Qty" },
    { key: "note", label: "Note" },
  ];

  it("emits header + rows with CRLF line endings", () => {
    const csv = toCsv<Row>(
      [
        { name: "A", qty: 1, note: null },
        { name: "B,2", qty: 2, note: 'has "quote"' },
      ],
      cols,
    );
    expect(csv).toBe('Name,Qty,Note\r\nA,1,\r\n"B,2",2,"has ""quote"""');
  });

  it("supports header lines (title, company, filters) above the column row", () => {
    const csv = toCsv<Row>([{ name: "x", qty: 1, note: "" }], cols, [
      "Sales Report",
      "ERPOVO Ltd",
      "Period: 2026-01-01 → 2026-01-31",
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Sales Report");
    expect(lines[1]).toBe("ERPOVO Ltd");
    expect(lines[2]).toBe("Period: 2026-01-01 → 2026-01-31");
    expect(lines[3]).toBe(""); // blank separator
    expect(lines[4]).toBe("Name,Qty,Note");
  });

  it("invokes column formatters", () => {
    const csv = toCsv<Row>(
      [{ name: "A", qty: 1500, note: null }],
      [
        { key: "name", label: "N" },
        { key: "qty", label: "Q", format: (v) => Number(v).toFixed(2) },
      ],
    );
    expect(csv).toBe("N,Q\r\nA,1500.00");
  });
});

describe("csvBlob", () => {
  it("prepends UTF-8 BOM so Excel detects encoding", async () => {
    const blob = csvBlob("Name,Qty\r\nবাংলা,1");
    const buf = new Uint8Array(await blob.arrayBuffer());
    // UTF-8 BOM = EF BB BF
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    // ...followed by the actual CSV content (decode with ignoreBOM to keep the marker)
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("বাংলা");
  });
});
