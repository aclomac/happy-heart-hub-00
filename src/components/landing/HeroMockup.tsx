import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Wallet,
  Settings,
  Bell,
  Search,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  ShoppingBag,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const data = [
  { name: "শনি", sales: 4200 },
  { name: "রবি", sales: 3800 },
  { name: "সোম", sales: 5100 },
  { name: "মঙ্গল", sales: 4600 },
  { name: "বুধ", sales: 5900 },
  { name: "বৃহস্পতি", sales: 6200 },
  { name: "শুক্র", sales: 4900 },
];

export function HeroMockup() {
  return (
    <div className="relative w-full max-w-4xl mx-auto perspective-1000 group">
      {/* Floating Card: Today's Sales */}
      <div className="absolute -top-6 -left-6 md:-left-12 z-20 animate-bounce-subtle">
        <div className="bg-white p-3 rounded-xl shadow-elevated border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-success">
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              আজকের বিক্রি / Today's Sales
            </p>
            <p className="text-sm font-bold text-slate-900">৳ 42,500</p>
          </div>
        </div>
      </div>

      {/* Floating Card: Low Stock */}
      <div className="absolute -bottom-4 -left-4 md:-left-8 z-20 animate-pulse-subtle">
        <div className="bg-white p-3 rounded-xl shadow-elevated border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-sale/10 flex items-center justify-center text-sale">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              কম স্টক
            </p>
            <p className="text-sm font-bold text-slate-900">8 items</p>
          </div>
        </div>
      </div>

      {/* Floating Card: Online Orders */}
      <div className="absolute top-1/4 -right-4 md:-right-8 z-20">
        <div className="bg-white p-3 rounded-xl shadow-elevated border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              অনলাইন অর্ডার
            </p>
            <p className="text-sm font-bold text-slate-900">12 New</p>
          </div>
        </div>
      </div>

      {/* Main Mockup Container */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all duration-700 group-hover:rotate-x-2 group-hover:-rotate-y-2">
        <div className="flex h-[400px] md:h-[500px]">
          {/* Mini Sidebar */}
          <div className="w-12 md:w-16 bg-sidebar-bg flex flex-col items-center py-4 gap-6 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-xs mb-2">
              E
            </div>
            {[LayoutDashboard, ShoppingCart, Package, Users, BarChart3, Wallet, Settings].map(
              (Icon, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    i === 0
                      ? "bg-primary/20 text-primary"
                      : "text-sidebar-fg/50 hover:text-sidebar-fg hover:bg-sidebar-hover",
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
              ),
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            {/* Top Bar Mockup */}
            <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <LayoutDashboard className="w-4 h-4 text-primary" />
                Dashboard
              </div>
              <div className="hidden md:flex items-center bg-slate-100 rounded-md px-3 py-1 gap-2 w-48">
                <Search className="w-3 h-3 text-muted-foreground" />
                <div className="h-2 w-24 bg-slate-200 rounded" />
              </div>
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <div className="w-7 h-7 rounded-full bg-slate-200" />
              </div>
            </div>

            {/* Dashboard Content */}
            <div className="p-4 md:p-6 space-y-6 overflow-y-auto">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "Total Sales",
                    value: "৳1.2M",
                    color: "text-primary",
                    bg: "bg-primary/5",
                  },
                  { label: "Revenue", value: "৳450K", color: "text-success", bg: "bg-success/5" },
                  {
                    label: "Pending Payments",
                    value: "5 New",
                    color: "text-sale",
                    bg: "bg-sale/5",
                  },
                  { label: "Profit", value: "৳270K", color: "text-utility", bg: "bg-utility/5" },
                ].map((stat, i) => (
                  <div
                    key={i}
                    className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm"
                  >
                    <p className="text-[10px] text-muted-foreground font-medium uppercase mb-1">
                      {stat.label}
                    </p>
                    <p
                      className={stat.value + " " + stat.color + " font-bold text-sm md:text-base"}
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Chart & POS Quick Sale */}
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      সাপ্তাহিক বিক্রির সারাংশ
                    </h3>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <div className="w-2 h-2 rounded-full bg-slate-200" />
                    </div>
                  </div>
                  <div className="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data}>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#fff",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                            fontSize: "10px",
                          }}
                          cursor={{ fill: "rgba(0,0,0,0.02)" }}
                        />
                        <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                          {data.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={index === 5 ? "#3b82f6" : "#e2e8f0"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-primary text-white p-4 rounded-xl shadow-lg flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
                      Quick POS Sale
                    </h3>
                    <p className="text-sm opacity-90 leading-tight">
                      Fast billing for retail shops.
                    </p>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-2 w-full bg-white/20 rounded" />
                    <div className="h-2 w-2/3 bg-white/20 rounded" />
                  </div>
                  <button className="mt-4 bg-white text-primary w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                    <Plus className="w-3 h-3" /> New Sale
                  </button>
                </div>
              </div>

              {/* Transactions Table Mockup */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    সাম্প্রতিক লেনদেন
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {[
                    {
                      id: "INV-2940",
                      customer: "Rahman Furniture House",
                      amount: "৳4,200",
                      status: "Paid",
                      type: "Sale",
                    },
                    {
                      id: "PUR-1029",
                      customer: "Rashid Enterprises",
                      amount: "৳12,500",
                      status: "Due",
                      type: "Purchase",
                    },
                    {
                      id: "INV-2939",
                      customer: "Sundarban Plywood",
                      amount: "৳1,800",
                      status: "Paid",
                      type: "Sale",
                    },
                    {
                      id: "INV-2938",
                      customer: "Star Furnishing Co",
                      amount: "৳3,500",
                      status: "Paid",
                      type: "Sale",
                    },
                  ].map((row, i) => (
                    <div
                      key={i}
                      className="px-4 py-2 flex items-center justify-between text-[11px]"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-7 h-7 rounded flex items-center justify-center",
                            row.type === "Sale"
                              ? "bg-success/10 text-success"
                              : "bg-sale/10 text-sale",
                          )}
                        >
                          {row.type === "Sale" ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <CreditCard className="w-3 h-3" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-700">{row.id}</p>
                          <p className="text-muted-foreground">{row.customer}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{row.amount}</p>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase",
                            row.status === "Paid"
                              ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning",
                          )}
                        >
                          {row.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Another Floating Card: Due Payments */}
      <div className="absolute -bottom-8 -right-4 md:-right-12 z-20">
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-elevated flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
              বকেয়া টাকা
            </p>
            <p className="text-sm font-bold text-white">৳ 18,200</p>
          </div>
        </div>
      </div>

      {/* POS Active Badge */}
      <div className="absolute top-1/2 -left-8 z-20 hidden md:block rotate-[-90deg]">
        <div className="bg-primary px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-widest shadow-lg flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          POS চালু
        </div>
      </div>
    </div>
  );
}
