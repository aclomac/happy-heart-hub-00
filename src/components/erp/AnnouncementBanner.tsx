import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Info, AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Announcement = {
  id: string;
  title: string;
  message: string;
  type: string;
  audience: string;
  target_plan: string | null;
  target_company_id: string | null;
  is_dismissible: boolean;
};

const ICONS: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  maintenance: Wrench,
};

const COLORS: Record<string, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-900",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  success: "bg-emerald-50 border-emerald-200 text-emerald-900",
  maintenance: "bg-violet-50 border-violet-200 text-violet-900",
};

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dismissed-announcements");
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  const { data } = useQuery({
    queryKey: ["active-announcements"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("platform_announcements")
        .select(
          "id, title, message, type, audience, target_plan, target_company_id, is_dismissible",
        )
        .eq("is_active", true)
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
    staleTime: 60_000,
  });

  const visible = (data ?? []).filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem("dismissed-announcements", JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void supabase
          .from("announcement_dismissals")
          .insert({ announcement_id: id, user_id: data.user.id });
      }
    });
  };

  return (
    <div className="space-y-2 px-4 pt-3">
      {visible.map((a) => {
        const Icon = ICONS[a.type] ?? Info;
        const color = COLORS[a.type] ?? COLORS.info;
        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${color}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{a.title}</div>
              <div className="text-xs opacity-90 whitespace-pre-wrap">{a.message}</div>
            </div>
            {a.is_dismissible && (
              <button
                onClick={() => dismiss(a.id)}
                className="opacity-60 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
