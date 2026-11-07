import { describe, expect, it } from "vitest";
import { adminConsentUrl, needsAdminConsent } from "../integrations/oauth";
import { CHECK_WAIT_MS, forwardingCheckToken, forwardingState } from "./portal-forwarding";

describe("Outlook forwarding check", () => {
  const rule = { ruleId: "r", forwardTo: "a@mail.example.be", createdAt: "2026-11-07T10:00:00Z" };
  const sentAt = new Date("2026-11-07T10:00:00Z");

  it("says whether the test email came back in time", () => {
    expect(forwardingState(null)).toBeNull();
    expect(forwardingState(rule)).toBe("untested");
    expect(forwardingState({ ...rule, check: { token: "t", sentAt: sentAt.toISOString(), error: "Mailgun 401" } })).toBe("untested");
    const pending = { ...rule, check: { token: "t", sentAt: sentAt.toISOString() } };
    expect(forwardingState(pending, new Date(sentAt.getTime() + 60_000))).toBe("checking");
    expect(forwardingState(pending, new Date(sentAt.getTime() + CHECK_WAIT_MS + 1))).toBe("blocked");
    expect(forwardingState({ ...rule, check: { ...pending.check, receivedAt: "2026-11-07T10:01:00Z" } }, new Date(sentAt.getTime() + CHECK_WAIT_MS * 4))).toBe("working");
  });

  it("finds the token in Outlook, Dutch and French forwards", () => {
    expect(forwardingCheckToken({ subject: "FW: Forwarding check 0123456789ab", text: "" })).toBe("0123456789ab");
    expect(forwardingCheckToken({ subject: "TR: something", text: "Objet : Forwarding check a1b2c3d4e5f6" })).toBe("a1b2c3d4e5f6");
    expect(forwardingCheckToken({ subject: "Forwarding check later", text: "" })).toBeNull();
  });

  it("recognises organisations that need an admin to approve the app", () => {
    expect(needsAdminConsent("access_denied", "AADSTS65004: User declined to consent")).toBe(false);
    expect(needsAdminConsent("access_denied", "AADSTS90094: An administrator of Contoso has set a policy")).toBe(true);
    expect(needsAdminConsent("consent_required", null)).toBe(true);
    const url = new URL(adminConsentUrl({ redirectUri: "https://testenvqv.vercel.app/api/calendar/microsoft/callback" }));
    expect(url.pathname).toBe("/organizations/v2.0/adminconsent");
    expect(url.searchParams.get("scope")).toContain("https://graph.microsoft.com/MailboxSettings.ReadWrite");
    expect(url.searchParams.get("state")).toBe("admin_consent");
  });
});
