import { supabase } from "@/integrations/supabase/client";

const KEY = "erpovo:device-id";
const DEMO_EMAIL = "admin@erpovo.com";
// Shared demo admin account: aggressively prune all other devices so the
// preview never gets stuck behind the device-limit gate.
async function pruneDemoDevices(userId: string, currentFingerprint: string) {
  const { data: userRes } = await supabase.auth.getUser();
  if (userRes.user?.email?.toLowerCase() !== DEMO_EMAIL) return;
  await supabase
    .from("devices")
    .delete()
    .eq("user_id", userId)
    .neq("device_fingerprint", currentFingerprint);
}

export async function resetDemoDevicesIfDemo(userId: string): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser();
  if (userRes.user?.email?.toLowerCase() !== DEMO_EMAIL) return false;
  const currentFingerprint = getDeviceFingerprint();
  await supabase
    .from("devices")
    .delete()
    .eq("user_id", userId)
    .neq("device_fingerprint", currentFingerprint);
  return true;
}

export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  let os = "Desktop";
  if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac/i.test(ua)) os = "Mac";
  else if (/Win/i.test(ua)) os = "Windows";
  else if (/Linux/i.test(ua)) os = "Linux";
  let browser = "Browser";
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Edg/i.test(ua)) browser = "Edge";
  return `${os} · ${browser}`;
}

export async function registerDevice(
  userId: string,
): Promise<{ ok: boolean; deviceCount: number }> {
  const fingerprint = getDeviceFingerprint();
  const name = getDeviceName();
  await pruneDemoDevices(userId, fingerprint).catch(() => {});
  await supabase.from("devices").upsert(
    {
      user_id: userId,
      device_fingerprint: fingerprint,
      device_name: name,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,device_fingerprint" },
  );
  const { count } = await supabase
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return { ok: true, deviceCount: count || 0 };
}

export type DeviceRow = {
  id: string;
  device_fingerprint: string;
  device_name: string | null;
  created_at: string;
  last_seen_at: string;
};

export async function checkDeviceAllowed(
  userId: string,
  maxDevices: number,
): Promise<{
  allowed: boolean;
  deviceCount: number;
  currentFingerprint: string;
  devices: DeviceRow[];
}> {
  const currentFingerprint = getDeviceFingerprint();
  await pruneDemoDevices(userId, currentFingerprint).catch(() => {});
  await registerDevice(userId);
  const { data, error } = await supabase
    .from("devices")
    .select("id, device_fingerprint, device_name, created_at, last_seen_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const devices = (data || []) as DeviceRow[];
  const limit = Math.max(1, maxDevices);
  const allowedSet = new Set(devices.slice(0, limit).map((d) => d.device_fingerprint));
  return {
    allowed: allowedSet.has(currentFingerprint),
    deviceCount: devices.length,
    currentFingerprint,
    devices,
  };
}

export async function deleteDevice(deviceId: string): Promise<void> {
  const { error } = await supabase.from("devices").delete().eq("id", deviceId);
  if (error) throw error;
}
