import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/app/utilities/barcode-generator")({
  component: BarcodeGenerator,
});

type Item = { id: string; name: string; sku: string | null; sale_price: number };

type Size = "small" | "medium" | "large";

const SIZES: Record<Size, { label: string; w: string; h: string; fs: string; bh: number }> = {
  small: { label: "Small (30×20mm)", w: "30mm", h: "20mm", fs: "8px", bh: 28 },
  medium: { label: "Medium (50×30mm)", w: "50mm", h: "30mm", fs: "10px", bh: 40 },
  large: { label: "Large (70×40mm)", w: "70mm", h: "40mm", fs: "12px", bh: 56 },
};

/**
 * Code-128-ish visual barcode: encodes string as alternating bars of varying
 * widths derived from char codes. Not scanner-spec accurate, but produces a
 * readable, printable label with the value text underneath (which most POS
 * setups in BD scan via the printed text + SKU). Good enough for in-house
 * stock tagging; replace with a real Code-128 encoder if/when needed.
 */
function BarcodeBars({ value, height }: { value: string; height: number }) {
  const bars = useMemo(() => {
    const out: { w: number; black: boolean }[] = [];
    const v = value || "0";
    for (let i = 0; i < v.length; i++) {
      const c = v.charCodeAt(i);
      out.push({ w: (c % 3) + 1, black: true });
      out.push({ w: ((c >> 2) % 3) + 1, black: false });
      out.push({ w: ((c >> 4) % 3) + 1, black: true });
      out.push({ w: 1, black: false });
    }
    return out;
  }, [value]);

  return (
    <div className="flex items-end" style={{ height }}>
      {bars.map((b, i) => (
        <div
          key={i}
          style={{
            width: `${b.w}px`,
            height: "100%",
            background: b.black ? "#000" : "transparent",
          }}
        />
      ))}
    </div>
  );
}

function BarcodeGenerator() {
  const companyId = useCurrentCompanyId();
  const [size, setSize] = useState<Size>("medium");
  const [copies, setCopies] = useState(1);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["barcode-items", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id,name,sku,sale_price")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Item[];
    },
  });

  const filtered = items.filter(
    (i) =>
      !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const labels = useMemo(() => {
    const out: { item: Item; key: string }[] = [];
    for (const [id, qty] of Object.entries(selected)) {
      const it = items.find((x) => x.id === id);
      if (!it || qty <= 0) continue;
      for (let i = 0; i < qty; i++) out.push({ item: it, key: `${id}-${i}` });
    }
    return out;
  }, [selected, items]);

  const handlePrint = () => window.print();

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Barcode Generator" />
        <NoCompanySelected />
      </div>
    );
  }

  const s = SIZES[size];

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .barcode-print-area, .barcode-print-area * { visibility: visible; }
          .barcode-print-area { position: absolute; left: 0; top: 0; }
        }
      `}</style>
      <PageHeader
        title="Barcode Generator"
        subtitle="Generate printable barcode labels for items"
        actions={
          <>
            <Link to="/app/utilities">
              <Button variant="outline" size="sm">
                Back
              </Button>
            </Link>
            <Button size="sm" onClick={handlePrint} disabled={labels.length === 0}>
              <Printer className="w-4 h-4" />
              Print {labels.length || ""}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-md p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Label size</Label>
              <Select value={size} onValueChange={(v) => setSize(v as Size)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SIZES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default copies per item</Label>
              <Input
                type="number"
                min="1"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <Input
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="border rounded-md overflow-auto max-h-[420px]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-left">SKU</th>
                  <th className="p-2 text-right w-24">Copies</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="p-2">{i.name}</td>
                    <td className="p-2">
                      {i.sku ?? <span className="text-muted-foreground">auto</span>}
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        className="h-7 text-right"
                        value={selected[i.id] ?? 0}
                        onChange={(e) =>
                          setSelected((s) => ({
                            ...s,
                            [i.id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        onFocus={(e) => {
                          if (!selected[i.id]) {
                            setSelected((s) => ({ ...s, [i.id]: copies }));
                            e.target.select();
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-muted-foreground">
                      No items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border rounded-md p-4">
          <div className="text-sm font-semibold mb-2">
            Preview ({labels.length} label{labels.length === 1 ? "" : "s"})
          </div>
          <div className="barcode-print-area flex flex-wrap gap-1">
            {labels.length === 0 && (
              <div className="text-sm text-muted-foreground p-4">
                Set copies &gt; 0 for one or more items to preview labels.
              </div>
            )}
            {labels.map(({ item, key }) => {
              const code = item.sku || item.id.slice(0, 10).toUpperCase();
              return (
                <div
                  key={key}
                  style={{
                    width: s.w,
                    height: s.h,
                    fontSize: s.fs,
                    border: "1px solid #ddd",
                    padding: "2px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ fontWeight: 600, lineHeight: 1.1 }}>{item.name}</div>
                  <BarcodeBars value={code} height={s.bh} />
                  <div style={{ textAlign: "center", fontFamily: "monospace" }}>{code}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
