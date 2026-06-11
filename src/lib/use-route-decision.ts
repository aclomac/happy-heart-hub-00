import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription, useDeviceGuard } from "@/lib/use-subscription";
import { useCurrentRole } from "@/lib/use-current-role";
import {
  setCurrentCompanyId,
  useCurrentCompanyId,
  getLastSelectedCompanyId,
} from "@/lib/use-company";
import {
  isDemoMode,
  getDemoSession,
  getDemoCompanies,
  DEMO_SESSION_KEY,
  hasDemoAuthCookie,
  startDemoSession,
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
  DEMO_COMPANY_ID,
} from "@/lib/demo/localStore";

export type RouteDecision =
  | { status: "loading"; debug: DecisionDebug }
  | { status: "ready"; target: string | null; debug: DecisionDebug };

export type DecisionDebug = {
  authLoading: boolean;
  user: string | null;
  profileLoading: boolean;
  companiesLoading: boolean;
  selectedCompanyId: string | null;
  subscriptionStatus: string | null;
  deviceStatus: string;
  currentPath: string;
  redirectTarget: string | null;
};

const ADMIN_LANDED_KEY = "erpovo:adminLandedOnce";
const CAME_FROM_LOGIN_KEY = "erpovo:cameFromLogin";
const AUTH_RESOLVE_TIMEOUT_MS = 8000;

// Public paths the orchestrator never touches (no redirect, no splash).
const PUBLIC_PASSTHROUGH = ["/", "/signup", "/login", "/forgot-password", "/reset-password", "/store"];

// Routes under /app/* that should be reachable even when a guard would
// normally redirect — so the user can manage billing / devices / admin.
const APP_ESCAPE_HATCHES = ["/app/subscription", "/app/upgrade", "/app/device-limit", "/app/admin"];

function inAppEscapeHatch(pathname: string) {
  return APP_ESCAPE_HATCHES.some((p) => pathname.startsWith(p));
}

function useAuthUser() {
  const [state, setState] = useState<{
    loading: boolean;
    userId: string | null;
    email: string | null;
  }>(() => {
    // Synchronously honor a demo session so the very first render is
    // already authenticated — prevents a brief "no user → /login" flicker
    // after refresh.
    if (typeof window !== "undefined" && isDemoMode()) {
      if (hasDemoAuthCookie() && !window.localStorage.getItem(DEMO_SESSION_KEY)) startDemoSession();
      const s = getDemoSession();
      if (import.meta.env.DEV) console.log("[demo-auth] demo localStorage detected");
      return {
        loading: false,
        userId: s?.userId ?? DEMO_USER_ID,
        email: s?.email ?? DEMO_USER_EMAIL,
      };
    }
    return { loading: true, userId: null, email: null };
  });

  useEffect(() => {
    let active = true;
    // Demo session short-circuits Supabase auth entirely.
    if (isDemoMode()) {
      if (hasDemoAuthCookie() && !window.localStorage.getItem(DEMO_SESSION_KEY)) startDemoSession();
      const s = getDemoSession();
      if (import.meta.env.DEV) console.log("[demo-auth] route guard allowed demo user");
      setState({
        loading: false,
        userId: s?.userId ?? DEMO_USER_ID,
        email: s?.email ?? DEMO_USER_EMAIL,
      });
      return () => {
        active = false;
      };
    }
    const timeout = new Promise<"timeout">((resolve) =>
      window.setTimeout(() => resolve("timeout"), AUTH_RESOLVE_TIMEOUT_MS),
    );
    Promise.race([supabase.auth.getUser(), timeout])
      .then(async (res) => {
        if (!active) return;
        if (res !== "timeout") {
          setState({
            loading: false,
            userId: res.data.user?.id ?? null,
            email: res.data.user?.email ?? null,
          });
          return;
        }
        const sessionRes = await Promise.race([
          supabase.auth.getSession(),
          new Promise<"timeout">((resolve) => window.setTimeout(() => resolve("timeout"), 2000)),
        ]);
        if (!active) return;
        if (sessionRes !== "timeout") {
          setState({
            loading: false,
            userId: sessionRes.data.session?.user?.id ?? null,
            email: sessionRes.data.session?.user?.email ?? null,
          });
          return;
        }
        setState({ loading: false, userId: null, email: null });
      })
      .catch(() => {
        if (active) setState({ loading: false, userId: null, email: null });
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!active) return;
      setState({
        loading: false,
        userId: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
      });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

function useCompaniesCount(userId: string | null) {
  return useQuery({
    queryKey: ["companies-count", userId, isDemoMode() ? "demo" : "live"],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      // Demo mode: read entirely from localStorage.
      if (isDemoMode()) {
        const list = getDemoCompanies();
        return { count: list.length, firstId: list[0]?.id ?? null };
      }
      try {
        const { data, count, error } = await supabase
          .from("companies")
          .select("id", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        return { count: count ?? 0, firstId: data?.[0]?.id ?? null };
      } catch {
        // Backend unreachable — surface 0 instead of throwing so the app
        // can still render (orchestrator will route to /companies).
        return { count: 0, firstId: null };
      }
    },
  });
}

/**
 * Single source of truth for post-auth navigation. Safe to call on ANY path.
 * Returns `loading` while data is hydrating or a `ready` target.
 */
export function useRouteDecision(): RouteDecision {
  const { pathname } = useLocation();
  const auth = useAuthUser();
  const isAppRoute = pathname.startsWith("/app");
  const isCompaniesRoute = pathname.startsWith("/companies");
  const isLoginRoute = pathname === "/login";

  // Gate downstream queries on auth being known.
  const queriesEnabled = !auth.loading && !!auth.userId;
  const roleQ = useCurrentRole();
  const subQ = useSubscription();
  const device = useDeviceGuard();
  const companyId = useCurrentCompanyId();
  const companiesQ = useCompaniesCount(queriesEnabled ? auth.userId : null);

  useEffect(() => {
    const companies = companiesQ.data;
    if (auth.userId && !companyId && companies?.count && companies.count > 0) {
      // Demo mode: pick Chair King (or first local company) without hitting Supabase.
      if (isDemoMode()) {
        const list = getDemoCompanies();
        const pick = list.find((c) => c.id === DEMO_COMPANY_ID) ?? list[0];
        if (pick) setCurrentCompanyId(pick.id, auth.userId);
        return;
      }
      const lastId = getLastSelectedCompanyId(auth.userId);
      if (lastId) {
        supabase
          .from("company_members")
          .select("company_id")
          .eq("user_id", auth.userId)
          .eq("company_id", lastId)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setCurrentCompanyId(data.company_id, auth.userId);
            } else if (companies.firstId) {
              setCurrentCompanyId(companies.firstId, auth.userId);
            }
          });
      } else if (companies.firstId) {
        setCurrentCompanyId(companies.firstId, auth.userId);
      }
    }
  }, [auth.userId, companyId, companiesQ.data]);

  const debug: DecisionDebug = {
    authLoading: auth.loading,
    user: auth.email,
    profileLoading: roleQ.isLoading,
    companiesLoading: companiesQ.isLoading,
    selectedCompanyId: companyId,
    subscriptionStatus: subQ.data?.status ?? null,
    deviceStatus: device.loading ? "loading" : device.allowed ? "ok" : "over-limit",
    currentPath: pathname,
    redirectTarget: null,
  };

  if (!auth.loading && auth.userId && (pathname === "/" || isLoginRoute)) {
    const target = "/app";
    return { status: "ready", target, debug: { ...debug, redirectTarget: target } };
  }

  // Public pass-through pages: never redirect, never splash unless already authed above.
  if (PUBLIC_PASSTHROUGH.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return { status: "ready", target: null, debug };
  }

  // 1) Auth still resolving → splash. Never redirect while unknown.
  if (auth.loading) {
    return { status: "loading", debug };
  }

  // 2) Not authed and trying to reach a protected area → /login.
  if (!auth.userId) {
    if (isAppRoute || isCompaniesRoute) {
      const target = "/login";
      return { status: "ready", target, debug: { ...debug, redirectTarget: target } };
    }
    return { status: "ready", target: null, debug };
  }

  // 3) Authed and sitting on /login → /app.
  if (isLoginRoute) {
    const target = "/app";
    return { status: "ready", target, debug: { ...debug, redirectTarget: target } };
  }

  // 4) For protected areas, wait for the rest of the state before deciding.
  if (isAppRoute || isCompaniesRoute) {
    const isEscapeHatch = isAppRoute && inAppEscapeHatch(pathname);
    const stillLoading =
      roleQ.isLoading ||
      companiesQ.isLoading ||
      (!isEscapeHatch && (subQ.isLoading || device.loading));
    if (stillLoading) {
      return { status: "loading", debug };
    }
  } else {
    // Anything else (e.g. random public path): leave alone.
    return { status: "ready", target: null, debug };
  }

  const sub = subQ.data;
  const role = roleQ.data;
  const companiesCount = companiesQ.data?.count ?? 0;

  // 5) Subscription expired → /app/subscription (only inside /app, not in
  // escape hatches so they remain reachable).
  if (isAppRoute && sub?.isExpired && !inAppEscapeHatch(pathname)) {
    const target = "/app/subscription";
    return { status: "ready", target, debug: { ...debug, redirectTarget: target } };
  }

  // 6) Device limit exceeded → /app/device-limit.
  if (isAppRoute && !device.allowed && !inAppEscapeHatch(pathname)) {
    const target = "/app/device-limit";
    return { status: "ready", target, debug: { ...debug, redirectTarget: target } };
  }

  // 7) Admin one-shot landing is now disabled by default for better user experience.
  // Security tests should only be accessible via manual navigation.
  if (
    isAppRoute &&
    role?.isAdmin &&
    typeof window !== "undefined" &&
    sessionStorage.getItem(CAME_FROM_LOGIN_KEY) === "1" &&
    sessionStorage.getItem(ADMIN_LANDED_KEY) !== "1"
  ) {
    sessionStorage.setItem(ADMIN_LANDED_KEY, "1");
    sessionStorage.removeItem(CAME_FROM_LOGIN_KEY);
    // LAND ON HOME instead of Security Tests
    const target = "/app";
    return { status: "ready", target, debug: { ...debug, redirectTarget: target } };
  }

  // 8) Inside /app/* but no valid company selected → /companies.
  if (isAppRoute && !inAppEscapeHatch(pathname)) {
    const companySelectionValid = !!companyId && companiesCount > 0;
    if (!companySelectionValid) {
      const target = "/companies";
      return { status: "ready", target, debug: { ...debug, redirectTarget: target } };
    }
  }

  // 9) Stay.
  return { status: "ready", target: null, debug };
}
