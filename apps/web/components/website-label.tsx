"use client";

import { useT } from "@/lib/i18n/client";

export function WebsiteLabel() {
  return <>{useT()("Website")}</>;
}
