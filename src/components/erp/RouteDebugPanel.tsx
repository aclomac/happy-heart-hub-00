import { useState } from "react";
import type { DecisionDebug } from "@/lib/use-route-decision";

type Props = {
  debug: DecisionDebug;
  status: "loading" | "ready";
  lastRedirectTarget: string | null;
  redirectCount: number;
  lastBlockReason: string | null;
  haltReason: string | null;
  onResetHalt: () => void;
};

/**
 * Dev-only floating debug panel. Shows the live state the orchestrator
 * uses to decide redirects. Helps diagnose flicker/loop issues at runtime.
 */
export function RouteDebugPanel(props: Props) {
  const [open, setOpen] = useState(true);
  const { debug, status, lastRedirectTarget, redirectCount, lastBlockReason, haltReason } = props;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          right: 8,
          zIndex: 99999,
          background: "rgba(0,0,0,0.75)",
          color: "white",
          padding: "4px 8px",
          fontSize: 11,
          borderRadius: 4,
          fontFamily: "monospace",
        }}
      >
        debug
      </button>
    );
  }

  const rows: Array<[string, string]> = [
    ["pathname", debug.currentPath],
    ["status", status],
    ["authLoading", String(debug.authLoading)],
    ["user", debug.user ?? "—"],
    ["profileLoading", String(debug.profileLoading)],
    ["companiesLoading", String(debug.companiesLoading)],
    ["selectedCompanyId", debug.selectedCompanyId ?? "—"],
    ["subscriptionStatus", debug.subscriptionStatus ?? "—"],
    ["deviceStatus", debug.deviceStatus],
    ["redirectTarget", debug.redirectTarget ?? "—"],
    ["lastRedirectTarget", lastRedirectTarget ?? "—"],
    ["redirectCount", String(redirectCount)],
  ];

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 99999,
        width: 320,
        maxHeight: "70vh",
        overflow: "auto",
        background: "rgba(10,10,10,0.92)",
        color: "white",
        padding: 10,
        fontSize: 11,
        lineHeight: 1.4,
        borderRadius: 6,
        fontFamily: "ui-monospace, monospace",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 12 }}>Route Debug</strong>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "transparent",
            color: "white",
            border: "1px solid #555",
            borderRadius: 3,
            fontSize: 10,
            padding: "1px 6px",
          }}
        >
          hide
        </button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td
                style={{
                  color: "#9ca3af",
                  padding: "1px 4px 1px 0",
                  verticalAlign: "top",
                  whiteSpace: "nowrap",
                }}
              >
                {k}
              </td>
              <td
                style={{
                  padding: "1px 0",
                  wordBreak: "break-all",
                  color: "#e5e7eb",
                }}
              >
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lastBlockReason && (
        <div
          style={{
            marginTop: 8,
            padding: 6,
            background: "rgba(234,179,8,0.15)",
            border: "1px solid rgba(234,179,8,0.5)",
            color: "#fde68a",
            borderRadius: 4,
          }}
        >
          blocked: {lastBlockReason}
        </div>
      )}
      {haltReason && (
        <div
          style={{
            marginTop: 8,
            padding: 6,
            background: "rgba(239,68,68,0.2)",
            border: "1px solid rgba(239,68,68,0.7)",
            color: "#fecaca",
            borderRadius: 4,
          }}
        >
          HALT: {haltReason}
          <button
            onClick={props.onResetHalt}
            style={{
              display: "block",
              marginTop: 6,
              background: "#ef4444",
              color: "white",
              border: 0,
              borderRadius: 3,
              padding: "2px 8px",
              fontSize: 10,
            }}
          >
            reset
          </button>
        </div>
      )}
    </div>
  );
}
