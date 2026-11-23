"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      className="h-9"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      Log out
    </Button>
  );
}
