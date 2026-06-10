import { Search, Calendar, Filter, Download, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FilterBar({
  onAdd,
  addLabel = "Add",
  addVariant = "default" as const,
}: {
  onAdd?: () => void;
  addLabel?: string;
  addVariant?: "default" | "sale" | "utility" | "success";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-card border rounded-md">
      <Select defaultValue="this-month">
        <SelectTrigger className="h-9 w-[150px]">
          <Calendar className="w-3.5 h-3.5 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="this-week">This Week</SelectItem>
          <SelectItem value="this-month">This Month</SelectItem>
          <SelectItem value="last-month">Last Month</SelectItem>
          <SelectItem value="this-year">This Year</SelectItem>
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="all-firms">
        <SelectTrigger className="h-9 w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-firms">All Firms</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="all-users">
        <SelectTrigger className="h-9 w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-users">All Users</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="all-stores">
        <SelectTrigger className="h-9 w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-stores">All Stores</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="all-pay">
        <SelectTrigger className="h-9 w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-pay">All Payment</SelectItem>
        </SelectContent>
      </Select>
      <div className="relative flex-1 min-w-[200px]">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input placeholder="Search..." className="pl-8 h-9" />
      </div>
      <Button variant="outline" size="sm">
        <Filter className="w-3.5 h-3.5" />
        More
      </Button>
      <Button variant="outline" size="sm">
        <Download className="w-3.5 h-3.5" />
        Excel
      </Button>
      <Button variant="outline" size="sm">
        <Printer className="w-3.5 h-3.5" />
        Print
      </Button>
      {onAdd && (
        <Button variant={addVariant} size="sm" onClick={onAdd}>
          + {addLabel}
        </Button>
      )}
    </div>
  );
}
