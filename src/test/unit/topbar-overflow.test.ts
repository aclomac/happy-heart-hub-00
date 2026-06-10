import { describe, it, expect, beforeEach, beforeAll } from "vitest";

// Minimal browser-storage + window stubs so the topbar modules behave under
// the project's Node test environment.
beforeAll(() => {
  const g = globalThis as unknown as {
    localStorage?: Storage;
    window?: {
      addEventListener: () => void;
      removeEventListener: () => void;
      dispatchEvent: () => boolean;
    };
  };
  if (!g.localStorage) {
    const store = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  }
  if (!g.window) {
    g.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
  }
});

import { DICTIONARY } from "@/lib/i18n";
import {
  pushNotification,
  markRead,
  markAllRead,
  clearNotifications,
  useNotifications,
} from "@/lib/notifications";
import { setPrivacyMode, getPrivacyMode, maskAmount } from "@/lib/use-privacy";

describe("topbar overflow menu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("i18n labels", () => {
    const keys = [
      "Notifications",
      "Payment Reminder",
      "Privacy",
      "Settings",
      "More options",
      "Mark read",
      "Mark unread",
      "Mark all read",
      "Clear all",
      "No notifications yet",
      "Overdue",
      "Due today",
      "Upcoming",
      "Mark contacted",
      "Search party, reference or phone",
      "Print failed",
      "Privacy on",
      "Privacy off",
    ];
    it.each(keys)("has Bangla translation for %s", (k) => {
      expect(DICTIONARY[k]).toBeDefined();
      expect(DICTIONARY[k].bn).toBeTruthy();
      expect(DICTIONARY[k].bn).not.toBe(DICTIONARY[k].en);
    });
  });

  describe("notifications store", () => {
    it("push + read returns notifications scoped to company", () => {
      pushNotification("co-1", { kind: "sale_created", title: "Sale #1" });
      pushNotification("co-1", { kind: "payment_received", title: "Payment #2" });
      pushNotification("co-2", { kind: "info", title: "Other" });
      const raw1 = JSON.parse(localStorage.getItem("erpovo:notifications:co-1") || "[]");
      const raw2 = JSON.parse(localStorage.getItem("erpovo:notifications:co-2") || "[]");
      expect(raw1).toHaveLength(2);
      expect(raw2).toHaveLength(1);
      expect(raw1[0].title).toBe("Payment #2"); // newest first
    });

    it("markRead/markAllRead toggle the read flag", () => {
      const n = pushNotification("co-1", { kind: "info", title: "T" });
      markRead("co-1", n.id, true);
      let raw = JSON.parse(localStorage.getItem("erpovo:notifications:co-1") || "[]");
      expect(raw[0].read).toBe(true);
      markRead("co-1", n.id, false);
      raw = JSON.parse(localStorage.getItem("erpovo:notifications:co-1") || "[]");
      expect(raw[0].read).toBe(false);
      pushNotification("co-1", { kind: "info", title: "T2" });
      markAllRead("co-1");
      raw = JSON.parse(localStorage.getItem("erpovo:notifications:co-1") || "[]");
      expect(raw.every((r: { read: boolean }) => r.read)).toBe(true);
    });

    it("clear empties the list", () => {
      pushNotification("co-1", { kind: "info", title: "T" });
      clearNotifications("co-1");
      const raw = JSON.parse(localStorage.getItem("erpovo:notifications:co-1") || "[]");
      expect(raw).toHaveLength(0);
    });

    it("exposes a hook", () => {
      // hook surface guard
      expect(typeof useNotifications).toBe("function");
    });
  });

  describe("privacy mode", () => {
    it("persists across reads", () => {
      expect(getPrivacyMode()).toBe(false);
      setPrivacyMode(true);
      expect(localStorage.getItem("erpovo:privacyMode")).toBe("1");
      expect(getPrivacyMode()).toBe(true);
      setPrivacyMode(false);
      expect(localStorage.getItem("erpovo:privacyMode")).toBeNull();
      expect(getPrivacyMode()).toBe(false);
    });

    it("maskAmount returns masked placeholder when hidden", () => {
      expect(maskAmount("1,234.00", false)).toBe("1,234.00");
      expect(maskAmount("1,234.00", true)).toBe("•••••");
      expect(maskAmount(99, true)).toBe("•••••");
    });
  });
});
