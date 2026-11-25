"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/client";

export function SignOutButton() {
  const t = useT();
  const router = useRouter();
  return (
    <Button
      className="h-9"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      {t("Log out")}
    </Button>
  );
}
