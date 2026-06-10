import type { ReactNode } from "react";
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
import { Download, Printer, FileText } from "lucide-react";

export interface InventoryFiltersValue {
  from: string;
  to: string;
  itemId: string;
  categoryId: string;
  warehouseId: string;
  type: string;
  search: string;
}

export interface InventoryFiltersProps {
  value: InventoryFiltersValue;
  onChange: (v: InventoryFiltersValue) => void;
  items: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  showType?: boolean;
  onExportCsv?: () => void;
  onPrint?: () => void;
  onPdf?: () => void;
  /** Extra action buttons (e.g. shared <ReportExportButtons />). */
  extraActions?: ReactNode;
}

export function InventoryReportFilters({
  value,
  onChange,
  items,
  categories,
  warehouses,
  showType = false,
  onExportCsv,
  onPrint,
  onPdf,
  extraActions,
}: InventoryFiltersProps) {
  const set = <K extends keyof InventoryFiltersValue>(k: K, v: InventoryFiltersValue[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="rounded-md border bg-card p-3 mb-3 print:hidden">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={value.to} onChange={(e) => set("to", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Item</Label>
          <Select value={value.itemId} onValueChange={(v) => set("itemId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={value.categoryId} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Warehouse</Label>
          <Select value={value.warehouseId} onValueChange={(v) => set("warehouseId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Item, reference…"
            value={value.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>
        {showType && (
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={value.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="opening">Opening</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="sale">Sale</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="transfer_in">Transfer In</SelectItem>
                <SelectItem value="transfer_out">Transfer Out</SelectItem>
                <SelectItem value="damage">Damage</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        {onExportCsv && (
          <Button variant="outline" size="sm" onClick={onExportCsv} className="gap-1">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        )}
        {onPrint && (
          <Button variant="outline" size="sm" onClick={onPrint} className="gap-1">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        )}
        {onPdf && (
          <Button variant="outline" size="sm" onClick={onPdf} className="gap-1">
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
        )}
        {extraActions}
      </div>
    </div>
  );
}
