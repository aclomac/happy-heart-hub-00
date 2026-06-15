import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { HelpCircle, X, Send, Trash2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useCurrentCompanyId } from "@/lib/use-company";
import { logAudit } from "@/lib/audit";
import {
  answerQuestion,
  getQuickHelpForRoute,
  routePageName,
  type SupportLang,
  type SupportLangPref,
} from "@/lib/support-chat/knowledge-base";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  lang?: SupportLang;
  actions?: { labelKey: string; to: string }[];
  refused?: boolean;
  createdAt: number;
}

const LS_HISTORY = "erpovo:support-chat:history";
const LS_ENABLED = "erpovo:support-chat:enabled";
const LS_LANG_PREF = "erpovo:support-chat:language-preference";

const PREF_OPTIONS: { value: SupportLangPref; labelKey: string }[] = [
  { value: "auto", labelKey: "Auto" },
  { value: "bn", labelKey: "Bangla" },
  { value: "en", labelKey: "English" },
];

function loadLangPref(): SupportLangPref {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_LANG_PREF) : null;
    if (raw === "bn" || raw === "en" || raw === "hi" || raw === "ar" || raw === "ur") {
      return raw;
    }
    return "auto";
  } catch {
    return "auto";
  }
}

function persistLangPref(pref: SupportLangPref) {
  try {
    window.localStorage.setItem(LS_LANG_PREF, pref);
  } catch {
    // ignore
  }
}

function loadHistory(): ChatMsg[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_HISTORY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMsg[]) : [];
  } catch {
    return [];
  }
}

function persistHistory(msgs: ChatMsg[]) {
  try {
    window.localStorage.setItem(LS_HISTORY, JSON.stringify(msgs.slice(-50)));
  } catch {
    // ignore
  }
}

export function SupportChatWidget() {
  const { t, lang } = useI18n();
  const companyId = useCurrentCompanyId();
  const routeState = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => loadHistory());
  const [langPref, setLangPref] = useState<SupportLangPref>(() => loadLangPref());
  const scrollRef = useRef<HTMLDivElement>(null);

  const enabled = useMemo(() => {
    try {
      return window.localStorage.getItem(LS_ENABLED) !== "0";
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    persistHistory(msgs);
  }, [msgs]);

  useEffect(() => {
    persistLangPref(langPref);
  }, [langPref]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, msgs]);

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next) {
      void logAudit({
        companyId,
        module: "Other",
        action: "support_chat.opened",
        metadata: { route: routeState },
      });
    }
  }, [open, companyId, routeState]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const userMsg: ChatMsg = {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
        createdAt: Date.now(),
      };
      const ans = answerQuestion(trimmed, {
        route: routeState,
        appLang: lang,
        langPref,
      });
      // If the user explicitly asked for a language, remember it for the chat.
      if (ans.pref) setLangPref(ans.pref);
      const aiMsg: ChatMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: ans.answer,
        lang: ans.lang,
        actions: ans.actions,
        refused: ans.refused,
        createdAt: Date.now(),
      };
      setMsgs((prev) => [...prev, userMsg, aiMsg]);
      setDraft("");
      void logAudit({
        companyId,
        module: "Other",
        action: "support_chat.message_sent",
        metadata: {
          route: routeState,
          detected_language: ans.lang,
          mode: "built_in",
          refused: ans.refused,
          topic: ans.topic,
          lang_pref: ans.pref ?? langPref,
        },
      });
    },
    [routeState, companyId, lang, langPref],
  );

  const clear = useCallback(() => {
    setMsgs([]);
    try {
      window.localStorage.removeItem(LS_HISTORY);
    } catch {
      // ignore
    }
    void logAudit({
      companyId,
      module: "Other",
      action: "support_chat.history_cleared",
    });
  }, [companyId]);

  if (!enabled) return null;

  return (
    <div className="print:hidden">
      {!open && (
        <button
          type="button"
          onClick={toggle}
          aria-label={t("Support Chat")}
          data-testid="support-chat-fab"
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition px-3.5 py-2.5"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="text-sm font-medium hidden sm:inline">{t("Support Chat")}</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={t("AI Support Assistant")}
          data-testid="support-chat-panel"
          className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] sm:w-96 max-h-[80vh] bg-card border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-primary" />
              <div className="text-sm font-semibold">{t("AI Support Assistant")}</div>
              <Badge variant="outline" className="text-[10px]">
                {t("Built-in Help Mode")}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <label className="sr-only" htmlFor="support-chat-lang-pref">
                {t("Language")}
              </label>
              <select
                id="support-chat-lang-pref"
                data-testid="support-chat-lang-pref"
                value={langPref}
                onChange={(e) => setLangPref(e.target.value as SupportLangPref)}
                aria-label={t("Language")}
                className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
              >
                {PREF_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={clear}
                aria-label={t("Clear Chat")}
                data-testid="support-chat-clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={toggle}
                aria-label={t("Close")}
                data-testid="support-chat-close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-3 text-sm bg-background"
          >
            {(() => {
              const effectiveLang: "en" | "bn" =
                langPref === "bn" || langPref === "banglish"
                  ? "bn"
                  : langPref === "en"
                    ? "en"
                    : lang;
              const pageName = routePageName(routeState, effectiveLang);
              if (!pageName) return null;
              return (
                <div
                  data-testid="support-chat-page-context"
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">{t("You are on")}:</span>
                  <span className="font-medium" lang={effectiveLang}>
                    {pageName}
                  </span>
                  <button
                    type="button"
                    onClick={() => send(t("Explain this page"))}
                    className="ml-auto rounded-full border bg-background px-2 py-0.5 hover:bg-accent transition-colors"
                    data-testid="support-chat-explain-page"
                  >
                    {t("Explain this page")}
                  </button>
                </div>
              );
            })()}

            {(() => {
              const effectiveLang: "en" | "bn" =
                langPref === "bn" || langPref === "banglish"
                  ? "bn"
                  : langPref === "en"
                    ? "en"
                    : lang;
              const quick = getQuickHelpForRoute(routeState);
              const visible = quick.items.slice(0, 6);
              return (
                <div
                  className="space-y-1"
                  data-testid="support-chat-quick-help"
                  data-quick-help-id={quick.id}
                  data-quick-help-lang={effectiveLang}
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    {quick.isGeneral ? t("General help") : t("Quick help for this page")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visible.map((q) => {
                      const label = effectiveLang === "bn" ? q.bn : q.en;
                      return (
                        <button
                          key={q.en}
                          type="button"
                          onClick={() => send(label)}
                          aria-label={t("Ask this")}
                          lang={effectiveLang}
                          className="text-xs rounded-full border px-2.5 py-1 hover:bg-accent transition-colors"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {msgs.length === 0 && (
              <p className="text-muted-foreground text-xs">
                {t("Ask anything about ERPOVO")} — {t("How can I help?")}
              </p>
            )}

            {msgs.map((m) => (
              <div
                key={m.id}
                lang={m.lang === "bn" || m.lang === "banglish" ? "bn" : m.lang}
                className={
                  m.role === "user"
                    ? "ml-6 rounded-lg bg-primary text-primary-foreground px-3 py-2 whitespace-pre-wrap break-words"
                    : "mr-6 rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap break-words"
                }
              >
                <div>{m.text}</div>
                {m.role === "assistant" && m.actions && m.actions.length > 0 && (
                  <div
                    className="mt-2 flex flex-wrap gap-1.5"
                    data-testid="support-chat-actions"
                    onClick={() =>
                      void logAudit({
                        companyId,
                        module: "Other",
                        action: "support_chat.action_clicked",
                        metadata: { route: routeState },
                      })
                    }
                  >
                    {m.actions.map((a) => (
                      <Button
                        key={a.to}
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                      >
                        <Link to={a.to}>{t(a.labelKey)}</Link>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            className="border-t p-2 flex items-center gap-2 bg-card"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("Ask anything about ERPOVO")}
              data-testid="support-chat-input"
              className="h-9"
            />
            <Button
              size="icon"
              type="submit"
              disabled={!draft.trim()}
              aria-label={t("Send")}
              className="h-9 w-9"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
