import Link from "next/link";
import { SignOutButton } from "./sign-out";

/** A login that belongs to no agency (removed from its office, or a workspace that was closed). */
export default function OnboardingPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[20px] font-semibold tracking-tight">No workspace yet</h1>
      <p className="text-muted">
        Your login isn&apos;t part of an agency. Ask your office to invite you again, or request access if your agency is new to us.
      </p>
      <Link href="/signup" className="text-fg underline-offset-2 hover:underline">
        Request access
      </Link>
      <SignOutButton />
    </div>
  );
}
