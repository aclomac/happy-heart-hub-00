import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SECURITY_TESTS,
  TEST_GROUPS,
  type SecurityTest,
  type TestCtx,
  type TestResult,
  type TestStatus,
  type TestGroup,
} from "@/lib/security-tests";
import { useSubscription, PLAN_FEATURES } from "@/lib/use-subscription";
import { PlayCircle, Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

export const Route = createFileRoute("/app/admin/security-tests")({
  component: SecurityTestsPage,
});

type ResultMap = Record<string, TestResult | undefined>;

function statusBadge(status: TestStatus) {
  switch (status) {
    case "pass":
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Passed
        </Badge>
      );
    case "fail":
      return (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case "skip":
      return (
        <Badge variant="secondary">
          <MinusCircle className="w-3 h-3 mr-1" />
          Skipped
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    default:
      return <Badge variant="outline">—</Badge>;
  }
}

function SecurityTestsPage() {
  const subQ = useSubscription();
  const [results, setResults] = useState<ResultMap>({});
  const [runningAll, setRunningAll] = useState(false);
  const [runningGroup, setRunningGroup] = useState<TestGroup | null>(null);

  const ctxQuery = useQuery({
    queryKey: ["sec-test-ctx", subQ.data?.plan, subQ.data?.isExpired],
    enabled: !!subQ.data,
    queryFn: async (): Promise<TestCtx> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? "";
      const { data: cos } = uid
        ? await supabase.from("companies").select("id").eq("owner_id", uid).limit(1)
        : { data: [] as { id: string }[] };
      const sub = subQ.data!;
      const plan = sub.plan ?? "basic";
      const features = PLAN_FEATURES[plan];
      return {
        userId: uid,
        ownedCompanyId: cos?.[0]?.id ?? null,
        plan,
        isExpired: !!sub.isExpired,
        maxCompanies: features.maxCompanies === Infinity ? 999999 : features.maxCompanies,
        maxDevices: features.maxDevices,
        payrollEnabled: features.payrollEnabled && !sub.isExpired,
      };
    },
  });

  const ctx = ctxQuery.data;

  const runOne = async (t: SecurityTest) => {
    if (!ctx) return;
    setResults((r) => ({ ...r, [t.id]: { status: "pending", expected: "", actual: "" } }));
    try {
      const res = await t.run(ctx);
      setResults((r) => ({ ...r, [t.id]: res }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [t.id]: {
          status: "fail",
          expected: "no exception",
          actual: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  };

  const runGroup = async (group: TestGroup) => {
    setRunningGroup(group);
    const list = SECURITY_TESTS.filter((t) => t.group === group);
    for (const t of list) await runOne(t);
    setRunningGroup(null);
  };

  const runAll = async () => {
    setRunningAll(true);
    for (const t of SECURITY_TESTS) await runOne(t);
    setRunningAll(false);
  };

  const summary = useMemo(() => {
    let pass = 0,
      fail = 0,
      skip = 0,
      pending = 0;
    for (const t of SECURITY_TESTS) {
      const r = results[t.id];
      if (!r) continue;
      if (r.status === "pass") pass++;
      else if (r.status === "fail") fail++;
      else if (r.status === "skip") skip++;
      else if (r.status === "pending") pending++;
    }
    return { pass, fail, skip, pending, total: SECURITY_TESTS.length };
  }, [results]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Security Test Suite</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Runs live probes against Supabase RLS policies, role helpers, and trigger-based limits
          using your current session. Each probe is expected to be <em>blocked</em>; a green badge
          confirms the safeguard is active.
        </p>
      </header>

      {/* Summary + controls */}
      <div className="flex flex-wrap items-center gap-3 bg-card border rounded-lg p-4">
        <div className="flex items-center gap-3 text-sm">
          <span>
            <strong className="text-emerald-600">{summary.pass}</strong> passed
          </span>
          <span>
            <strong className="text-red-600">{summary.fail}</strong> failed
          </span>
          <span>
            <strong className="text-slate-500">{summary.skip}</strong> skipped
          </span>
          <span className="text-muted-foreground">/ {summary.total} total</span>
          {ctx ? (
            <span className="ml-3 text-xs text-muted-foreground">
              Plan: <b>{ctx.plan}</b> · Expired: <b>{String(ctx.isExpired)}</b> · Payroll:{" "}
              <b>{String(ctx.payrollEnabled)}</b> · Max devices: <b>{ctx.maxDevices}</b>
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            onClick={runAll}
            disabled={!ctx || runningAll}
            className="bg-primary text-primary-foreground"
          >
            {runningAll ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4 mr-2" />
            )}
            Run All Tests
          </Button>
        </div>
      </div>

      {/* Groups */}
      {TEST_GROUPS.map((group) => {
        const list = SECURITY_TESTS.filter((t) => t.group === group);
        const isBusy = runningGroup === group || runningAll;
        return (
          <section key={group} className="bg-card border rounded-lg overflow-hidden">
            <header className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <h2 className="font-semibold">{group}</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runGroup(group)}
                disabled={!ctx || isBusy}
              >
                {runningGroup === group ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="w-4 h-4 mr-2" />
                )}
                Run Group
              </Button>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium w-1/2">Test</th>
                    <th className="text-left px-4 py-2 font-medium">Expected</th>
                    <th className="text-left px-4 py-2 font-medium">Actual</th>
                    <th className="text-left px-4 py-2 font-medium w-28">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => {
                    const r = results[t.id];
                    return (
                      <tr key={t.id} className="border-t">
                        <td className="px-4 py-2">{t.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r?.expected ?? "—"}</td>
                        <td className="px-4 py-2 text-xs font-mono break-all max-w-xs">
                          {r?.actual ?? "—"}
                          {r?.code ? (
                            <span className="ml-1 inline-block text-[10px] uppercase opacity-70">
                              [{r.code}]
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">
                          {r ? statusBadge(r.status) : <Badge variant="outline">—</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
