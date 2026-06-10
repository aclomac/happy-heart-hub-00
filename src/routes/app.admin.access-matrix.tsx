import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ROUTE_RULES } from "@/lib/route-permissions";
import {
  PLAN_STATES,
  ROLES,
  OUTCOME_META,
  evaluateCell,
  type SyntheticRole,
} from "@/lib/access-matrix";

export const Route = createFileRoute("/app/admin/access-matrix")({
  component: AccessMatrixPage,
});

const EXTRA_ROUTES = [
  { prefix: "/app", label: "Dashboard" },
  { prefix: "/companies", label: "Companies" },
  { prefix: "/companies/new", label: "+ Company" },
  { prefix: "/app/subscription", label: "Subscription" },
  { prefix: "/app/upgrade/gold", label: "Upgrade" },
  { prefix: "/app/settings", label: "Settings" },
];

function AccessMatrixPage() {
  const [deviceExceeded, setDeviceExceeded] = useState(false);
  const [companyExceeded, setCompanyExceeded] = useState(false);

  const allRoutes = useMemo(
    () => [...EXTRA_ROUTES, ...ROUTE_RULES.map((r) => ({ prefix: r.prefix, label: r.label }))],
    [],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Access Matrix</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Synthetic evaluation of every plan × role × route combination using the same predicates
          that guard the live app. Use this page to verify direct-URL protection without seeding
          test accounts.
        </p>
      </header>

      <div className="flex flex-wrap gap-6 items-center bg-card border rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Switch id="dev" checked={deviceExceeded} onCheckedChange={setDeviceExceeded} />
          <Label htmlFor="dev" className="text-sm">
            Device limit exceeded
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="co" checked={companyExceeded} onCheckedChange={setCompanyExceeded} />
          <Label htmlFor="co" className="text-sm">
            Company limit exceeded
          </Label>
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
          {Object.entries(OUTCOME_META).map(([k, m]) => (
            <span
              key={k}
              className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${m.className}`}
            >
              {m.short} · {m.label}
            </span>
          ))}
        </div>
      </div>

      {PLAN_STATES.map((plan) => (
        <section key={plan.key} className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 border-b font-semibold text-sm">{plan.label}</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-muted/20">
                  <th className="text-left px-3 py-2 sticky left-0 bg-muted/20 z-10">
                    Role / Route
                  </th>
                  {allRoutes.map((r) => (
                    <th
                      key={r.prefix}
                      className="px-2 py-2 text-left font-medium whitespace-nowrap"
                      title={r.prefix}
                    >
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role) => (
                  <tr key={role.key} className="border-t">
                    <td className="px-3 py-1.5 font-medium sticky left-0 bg-card z-10 whitespace-nowrap">
                      {role.label}
                    </td>
                    {allRoutes.map((r) => {
                      const outcome = evaluateCell({
                        pathname: r.prefix,
                        plan: plan.key,
                        role: role.key as SyntheticRole,
                        deviceExceeded,
                        companyExceeded,
                      });
                      const meta = OUTCOME_META[outcome];
                      return (
                        <td key={r.prefix} className="px-2 py-1.5">
                          <span
                            className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-semibold ${meta.className}`}
                          >
                            {meta.short}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
