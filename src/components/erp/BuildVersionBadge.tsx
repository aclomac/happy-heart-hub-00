import {
  DEPLOYED_BUILD_HASH,
  DEPLOYED_BUILD_TIMESTAMP,
  ERPOVO_SW_CACHE_VERSION,
} from "@/lib/build-info";

export function BuildVersionBadge() {
  return (
    <div className="space-y-0.5 text-center text-[10px] leading-tight opacity-60">
      <div>Build {DEPLOYED_BUILD_HASH}</div>
      <div>{DEPLOYED_BUILD_TIMESTAMP}</div>
      <div>SW {ERPOVO_SW_CACHE_VERSION}</div>
    </div>
  );
}
