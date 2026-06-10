import { createFileRoute } from "@tanstack/react-router";
import { PlanLockScreen } from "@/components/erp/PlanLockScreen";
import { useDeviceGuard } from "@/lib/use-subscription";

export const Route = createFileRoute("/app/device-limit")({
  component: DeviceLimitPage,
});

function DeviceLimitPage() {
  const { deviceCount, maxDevices, devices, currentFingerprint, refetch } = useDeviceGuard();
  return (
    <PlanLockScreen
      reason="devices"
      deviceCount={deviceCount}
      maxDevices={maxDevices}
      devices={devices}
      currentFingerprint={currentFingerprint}
      onDevicesChanged={refetch}
    />
  );
}
