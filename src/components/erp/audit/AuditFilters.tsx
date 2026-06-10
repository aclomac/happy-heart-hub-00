import { useEffect, useState } from "react";
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
import { Search, X } from "lucide-react";

export type AuditImpactType = "" | "balance" | "stock" | "none";

export type AuditFilterValues = {
  from: string;
  to: string;
  userId: string;
  module: string;
  action: string;
  status: string;
  impactType: AuditImpactType;
  search: string;
};

export const MODULES = [
  "Sales",
  "Purchases",
  "Payments",
  "Expenses",
  "Parties",
  "Items",
  "Cash",
  "Bank",
  "Mobile",
  "Cheque",
  "Loan",
  "Reconciliation",
  "Salary",
  "Payroll",
  "Subscription",
  "Auth",
  "Settings",
  "Other",
];

export const ACTIONS = [
  "created",
  "updated",
  "deleted",
  "restored",
  "permanent_delete",
  "cancelled",
  "reversed",
  "posted",
  "approved",
  "rejected",
  "blocked_restore",
  "failed_restore",
  "permission_denied",
  "login",
  "logout",
];

export const STATUSES = ["success", "posted", "blocked", "failed", "denied", "pending"];

export function AuditFilters({
  value,
  onChange,
  users,
  onReset,
}: {
  value: AuditFilterValues;
  onChange: (v: AuditFilterValues) => void;
  users: { id: string; label: string }[];
  onReset: () => void;
}) {
  const [search, setSearch] = useState(value.search);
  useEffect(() => {
    setSearch(value.search);
  }, [value.search]);

  const set = <K extends keyof AuditFilterValues>(k: K, v: AuditFilterValues[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 p-3 border rounded-lg bg-card mb-3">
      <div>
        <Label className="text-xs">From</Label>
        <Input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input type="date" value={value.to} onChange={(e) => set("to", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">User</Label>
        <Select
          value={value.userId || "all"}
          onValueChange={(v) => set("userId", v === "all" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Module</Label>
        <Select
          value={value.module || "all"}
          onValueChange={(v) => set("module", v === "all" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {MODULES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Action</Label>
        <Select
          value={value.action || "all"}
          onValueChange={(v) => set("action", v === "all" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Status</Label>
        <Select
          value={value.status || "all"}
          onValueChange={(v) => set("status", v === "all" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Impact</Label>
        <Select
          value={value.impactType || "all"}
          onValueChange={(v) => set("impactType", (v === "all" ? "" : v) as AuditImpactType)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All impacts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All impacts</SelectItem>
            <SelectItem value="balance">Balance</SelectItem>
            <SelectItem value="stock">Stock</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Search</Label>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            set("search", search.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Ref, party, item, amount, user…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => {
              setSearch("");
              onReset();
            }}
            title="Clear filters"
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
