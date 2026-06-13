/**
 * Steadfast Courier integration service
 * -------------------------------------
 * Service abstraction with explicit diagnostics. Direct-browser mode hits
 * the live `portal.packzy.com` API; local-demo simulates a successful
 * consignment locally so QA can verify the order/tracking flow without
 * leaking real credentials.
 */
import {
  classifyFetchError,
  maskSecret,
  saveDiagnostic,
  type DiagnosticResult,
  type IntegrationMode,
} from "./diagnostics";
import {
  genId, getCouriers, setCouriers, getDeliveries, setDeliveries,
  getOrders, setOrders, getSyncLogs, setSyncLogs,
  type EcoCourier, type EcoDeliveryStatus, type EcoOrder,
} from "@/lib/demo/ecommerce";

export interface SteadfastConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  status: "active" | "inactive";
  pickupAddress?: string;
  defaultDeliveryType?: string;
  defaultNote?: string;
}

const SF_KEY = "erpovo:eco:sf_config_v1";

export const DEFAULT_STEADFAST_CONFIG: SteadfastConfig = {
  baseUrl: "https://portal.packzy.com/api/v1",
  apiKey: "",
  secretKey: "",
  status: "inactive",
  pickupAddress: "",
  defaultDeliveryType: "0",
  defaultNote: "",
};

export function getSteadfastConfig(): SteadfastConfig {
  if (typeof window === "undefined") return DEFAULT_STEADFAST_CONFIG;
  try {
    const raw = localStorage.getItem(SF_KEY);
    return raw ? { ...DEFAULT_STEADFAST_CONFIG, ...JSON.parse(raw) } : DEFAULT_STEADFAST_CONFIG;
  } catch { return DEFAULT_STEADFAST_CONFIG; }
}
export function setSteadfastConfig(c: SteadfastConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SF_KEY, JSON.stringify(c));
}
export function resetSteadfastConfig() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SF_KEY);
}

export function maskedSteadfastCreds(c: SteadfastConfig) {
  return { apiKey: maskSecret(c.apiKey), secretKey: maskSecret(c.secretKey) };
}

function headers(c: SteadfastConfig): HeadersInit {
  return {
    "Api-Key": c.apiKey,
    "Secret-Key": c.secretKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function validate(c: SteadfastConfig): string | null {
  if (!c.baseUrl) return "API Base URL is required";
  if (!c.apiKey) return "Api-Key is required";
  if (!c.secretKey) return "Secret-Key is required";
  if (!/^https?:\/\//i.test(c.baseUrl)) return "Base URL must start with http(s)://";
  return null;
}

function makeDiag(action: string, c: SteadfastConfig, url: string): DiagnosticResult {
  return {
    provider: "Steadfast",
    action,
    url,
    maskedCreds: maskedSteadfastCreds(c),
    at: new Date().toISOString(),
    status: "failed", errorKind: "unknown", message: "",
  };
}

function persist(key: string, d: DiagnosticResult): DiagnosticResult {
  saveDiagnostic(key, d);
  return d;
}

function mapSteadfastDeliveryStatus(s: string | undefined): EcoDeliveryStatus {
  switch ((s || "").toLowerCase()) {
    case "in_review":
    case "pending": return "Pending";
    case "delivered_approval_pending":
    case "partial_delivered_approval_pending":
    case "cancelled_approval_pending":
    case "unknown_approval_pending":
    case "delivery_pending":
    case "hold": return "Hold";
    case "delivered": return "Delivered";
    case "partial_delivered": return "Delivered";
    case "cancelled": return "Failed";
    case "returned":
    case "unknown": return "Returned";
    case "in_transit": return "In Transit";
    case "picked_up": return "Picked Up";
    default: return "Pending";
  }
}

export const steadfastService = {
  async testConnection(c: SteadfastConfig, mode: IntegrationMode): Promise<DiagnosticResult> {
    // Lightweight balance endpoint is the canonical Steadfast health-check.
    const url = `${c.baseUrl.replace(/\/+$/, "")}/get_balance`;
    const d = makeDiag("Test Connection", c, url);

    const invalid = validate(c);
    if (invalid) return persist("steadfast", { ...d, status: "failed", errorKind: "validation", message: invalid });

    if (mode === "local-demo") {
      return persist("steadfast", {
        ...d, status: "skipped", errorKind: "mode_disabled",
        message: "Local Demo Mode — live Steadfast API not called. Switch Integration Mode to Direct Browser API to test.",
      });
    }
    if (mode === "backend-proxy" || mode === "electron-proxy") {
      return persist("steadfast", {
        ...d, status: "blocked", errorKind: "config",
        message: `${mode === "backend-proxy" ? "Backend" : "Electron"} proxy is not yet configured. Forward this call through a server route.`,
      });
    }

    try {
      const res = await fetch(url, { method: "GET", headers: headers(c) });
      const text = await res.text();
      let data: unknown; try { data = text ? JSON.parse(text) : undefined; } catch { data = text.slice(0, 300); }
      if (res.ok) {
        return persist("steadfast", { ...d, status: "success", errorKind: "none", httpStatus: res.status, message: "Connected.", rawSafe: data });
      }
      const msg =
        res.status === 401 ? "401 Unauthorized — invalid Api-Key/Secret-Key." :
        res.status === 403 ? "403 Forbidden — merchant inactive or restricted." :
        res.status === 404 ? "404 Not Found — wrong Base URL." :
        res.status === 422 ? "422 Validation error from Steadfast." :
        `HTTP ${res.status}`;
      return persist("steadfast", {
        ...d, status: "failed", httpStatus: res.status,
        errorKind: res.status === 401 || res.status === 403 ? "auth" : res.status === 404 ? "not_found" : res.status === 422 ? "validation" : "server",
        message: msg, rawSafe: data,
      });
    } catch (e) {
      const cls = classifyFetchError(e);
      return persist("steadfast", { ...d, status: "failed", errorKind: cls.kind, message: cls.message });
    }
  },

  async createConsignment(
    c: SteadfastConfig,
    mode: IntegrationMode,
    order: EcoOrder,
  ): Promise<DiagnosticResult> {
    const url = `${c.baseUrl.replace(/\/+$/, "")}/create_order`;
    const d = makeDiag("Create Consignment", c, url);
    const payload = {
      invoice: order.orderNo,
      recipient_name: order.customerName,
      recipient_phone: order.phone,
      recipient_address: order.address,
      cod_amount: Math.max(0, order.codAmount - order.paidAmount),
      note: order.notes || c.defaultNote || "",
      item_description: order.items.map((i) => `${i.qty}× ${i.name}`).join(", ").slice(0, 200),
      delivery_type: c.defaultDeliveryType ?? "0",
    };

    const apply = (consignmentId: string, trackingCode: string, deliveryStatus: EcoDeliveryStatus, source: string) => {
      // Ensure a Steadfast courier row exists.
      const couriers = getCouriers();
      let sfCourier = couriers.find((x) => x.type === "Steadfast" && x.status === "active");
      if (!sfCourier) {
        sfCourier = {
          id: genId("cr"), name: "Steadfast", type: "Steadfast", baseUrl: c.baseUrl,
          defaultDeliveryCharge: 70, returnCharge: 40, codChargePct: 1, status: "active",
        } as EcoCourier;
        couriers.push(sfCourier); setCouriers(couriers);
      }
      const trackingUrl = trackingCode ? `https://steadfast.com.bd/t/${encodeURIComponent(trackingCode)}` : null;
      const orders = getOrders();
      const nowIso = new Date().toISOString();
      const next = orders.map((o) => o.id === order.id ? {
        ...o,
        courierId: sfCourier!.id,
        courierName: sfCourier!.name,
        courierProvider: "Steadfast",
        consignmentId,
        trackingId: trackingCode || consignmentId,
        trackingCode: trackingCode || consignmentId,
        trackingUrl,
        courierLastSyncedAt: nowIso,
        deliveryStatus,
        notes: `${o.notes ?? ""}\nSteadfast cid=${consignmentId} tracking=${trackingCode} (${source})`.trim(),
      } : o);
      setOrders(next);
      const deliveries = getDeliveries();
      if (!deliveries.some((dd) => dd.orderId === order.id)) {
        deliveries.push({
          id: genId("dl"), orderId: order.id, courierId: sfCourier!.id,
          trackingId: trackingCode || consignmentId, status: deliveryStatus,
          dispatchDate: new Date().toISOString().slice(0, 10), deliveredDate: null, returnDate: null,
          deliveryCharge: sfCourier!.defaultDeliveryCharge, returnCharge: sfCourier!.returnCharge,
          codAmount: order.codAmount, codCollected: 0, courierPaid: 0,
          notes: `Steadfast ${source} url=${trackingUrl ?? ""}`,
        });
        setDeliveries(deliveries);
      }
      const logs = getSyncLogs();
      logs.unshift({
        id: genId("sl"), time: nowIso, websiteId: order.websiteId,
        action: `Steadfast create_consignment (${source})`, status: "success",
        newOrders: 0, updatedOrders: 1, failed: 0,
      });
      setSyncLogs(logs);
    };

    const invalid = validate(c);
    if (invalid) return persist("steadfast_consignment", { ...d, status: "failed", errorKind: "validation", message: invalid, rawSafe: payload });

    if (mode === "local-demo") {
      const cid = `LOCAL-${Date.now()}`;
      apply(cid, cid, "Assigned", "local-demo");
      return persist("steadfast_consignment", {
        ...d, status: "skipped", errorKind: "mode_disabled",
        message: `Local Demo Mode — simulated consignment ${cid} created locally. Switch to Direct Browser API to call Steadfast.`,
        rawSafe: { consignment_id: cid, tracking_code: cid, payload },
      });
    }
    if (mode !== "direct-browser") {
      return persist("steadfast_consignment", { ...d, status: "blocked", errorKind: "config", message: "Backend / Electron proxy required for live consignment.", rawSafe: payload });
    }

    try {
      const res = await fetch(url, { method: "POST", headers: headers(c), body: JSON.stringify(payload) });
      const text = await res.text();
      let data: { consignment?: { consignment_id?: string; tracking_code?: string; status?: string }; message?: string } | string = text;
      try { data = JSON.parse(text); } catch { /* keep text */ }
      if (res.ok && typeof data === "object" && data.consignment) {
        const cid = String(data.consignment.consignment_id ?? "");
        const track = String(data.consignment.tracking_code ?? cid);
        apply(cid, track, "Assigned", "live");
        return persist("steadfast_consignment", {
          ...d, status: "success", errorKind: "none", httpStatus: res.status,
          message: `Created consignment ${cid}.`, rawSafe: data,
        });
      }
      return persist("steadfast_consignment", {
        ...d, status: "failed", httpStatus: res.status,
        errorKind: res.status === 401 || res.status === 403 ? "auth" : res.status === 422 ? "validation" : "server",
        message: typeof data === "object" && data.message ? data.message : `HTTP ${res.status}`,
        rawSafe: data,
      });
    } catch (e) {
      const cls = classifyFetchError(e);
      return persist("steadfast_consignment", { ...d, status: "failed", errorKind: cls.kind, message: cls.message, rawSafe: payload });
    }
  },

  async trackParcel(
    c: SteadfastConfig,
    mode: IntegrationMode,
    consignmentIdOrTracking: string,
  ): Promise<DiagnosticResult & { deliveryStatus?: EcoDeliveryStatus }> {
    const trackUrl = `${c.baseUrl.replace(/\/+$/, "")}/status_by_trackingcode/${encodeURIComponent(consignmentIdOrTracking)}`;
    const d = makeDiag("Track Parcel", c, trackUrl);

    if (!consignmentIdOrTracking) {
      return { ...persist("steadfast_track", { ...d, status: "failed", errorKind: "validation", message: "Tracking code missing" }) };
    }

    if (mode === "local-demo") {
      // Cycle deterministic local status for demo.
      const cycle: EcoDeliveryStatus[] = ["Assigned", "Picked Up", "In Transit", "Delivered"];
      const idx = Math.abs(consignmentIdOrTracking.split("").reduce((a, c2) => a + c2.charCodeAt(0), 0)) % cycle.length;
      const next = cycle[idx];
      const out = persist("steadfast_track", {
        ...d, status: "skipped", errorKind: "mode_disabled",
        message: `Local Demo Mode — simulated status: ${next}`,
        rawSafe: { tracking: consignmentIdOrTracking, status: next },
      });
      return { ...out, deliveryStatus: next };
    }
    if (mode !== "direct-browser") {
      return { ...persist("steadfast_track", { ...d, status: "blocked", errorKind: "config", message: "Proxy not configured for tracking." }) };
    }

    try {
      const res = await fetch(trackUrl, { method: "GET", headers: headers(c) });
      const text = await res.text();
      let data: { delivery_status?: string; status?: string; message?: string } | string = text;
      try { data = JSON.parse(text); } catch { /* keep */ }
      if (res.ok && typeof data === "object") {
        const status = mapSteadfastDeliveryStatus(data.delivery_status ?? data.status);
        const out = persist("steadfast_track", {
          ...d, status: "success", errorKind: "none", httpStatus: res.status,
          message: `Status: ${status}`, rawSafe: data,
        });
        return { ...out, deliveryStatus: status };
      }
      return { ...persist("steadfast_track", {
        ...d, status: "failed", httpStatus: res.status,
        errorKind: res.status === 401 || res.status === 403 ? "auth" : res.status === 404 ? "not_found" : "server",
        message: typeof data === "object" && data.message ? data.message : `HTTP ${res.status}`,
        rawSafe: data,
      }) };
    } catch (e) {
      const cls = classifyFetchError(e);
      return { ...persist("steadfast_track", { ...d, status: "failed", errorKind: cls.kind, message: cls.message }) };
    }
  },
};
