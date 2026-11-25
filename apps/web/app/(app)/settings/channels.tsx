"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import type { WhatsAppCheckState, WhatsAppState } from "../actions";
import { useT } from "@/lib/i18n/client";

const field = "h-8 w-full rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

export function CopyText({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? t("Copied") : t("Copy")}
    </Button>
  );
}

/** The agency's own WhatsApp Business number from Meta's WhatsApp Manager. */
export function WhatsAppForm({ action }: { action: (state: WhatsAppState, form: FormData) => Promise<WhatsAppState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!open) {
    return (
      <Button size="sm" type="button" onClick={() => setOpen(true)}>
        {t("Connect your own number")}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="displayNumber" placeholder="+32 470 12 34 56" className={field} required />
        <input name="phoneNumberId" placeholder={t("Phone number ID")} inputMode="numeric" className={field} required />
      </div>
      <input name="accessToken" type="password" placeholder={t("Permanent access token (system user)")} autoComplete="off" className={field} required />
      {state?.error && <p className="text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={pending}>
          {pending ? t("Checking…") : t("Connect")}
        </Button>
        <Button size="sm" type="button" onClick={() => setOpen(false)}>
          {t("Cancel")}
        </Button>
      </div>
    </form>
  );
}

const when = (iso: string, locale: string) => new Date(iso).toLocaleString(locale, { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Asks Meta about the number and shows why recent WhatsApp messages did or didn't arrive; optionally sends booking_confirmed to a phone. */
export function WhatsAppCheckForm({ action }: { action: (state: WhatsAppCheckState, form: FormData) => Promise<WhatsAppCheckState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">
        {t("Check WhatsApp")}
      </button>
    );
  }
  const r = state?.result;
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-line p-3 text-[12px]">
      <form action={formAction} className="flex flex-col gap-2">
        <p className="text-muted">{t("Leave the phone empty to only check the connection. With a phone, we send the booking_confirmed template to it with example details.")}</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input name="phone" placeholder={t("Your mobile, e.g. +32 470 12 34 56")} inputMode="tel" className={field} />
          <select name="language" defaultValue="nl" className={field}>
            <option value="nl">{t("Dutch")}</option>
            <option value="fr">{t("French")}</option>
            <option value="en">English</option>
            <option value="de">{t("German")}</option>
          </select>
          <Button variant="primary" size="sm" disabled={pending}>
            {pending ? t("Checking…") : t("Check")}
          </Button>
        </div>
      </form>
      {state?.error && <p className="text-danger">{state.error}</p>}
      {r && !r.connected && <p className="text-danger">{t("No WhatsApp number is set up: no number in Settings and no WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN in Vercel.")}</p>}
      {r?.connected && (
        <div className="flex flex-col gap-1">
          <div className="font-medium">{t("Number ({source}, ID {id})", { source: r.source === "own" ? t("your own") : t("shared, from Vercel"), id: r.phoneNumberId ?? "" })}</div>
          {r.numberError ? (
            <p className="text-danger">{t("Meta refused: {why}", { why: r.numberExplained ?? r.numberError })}</p>
          ) : (
            <ul className="text-muted">
              {Object.entries(r.number ?? {}).map(([key, value]) => (
                <li key={key}>
                  {key.replaceAll("_", " ")}: <span className="text-fg">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {r?.connected && r.test && (
        <div>
          <div className="font-medium">{t("Test message")}</div>
          {r.test.sent ? (
            <p className="text-muted">{t("Meta accepted it. If it doesn't arrive within a minute, Meta failed it afterwards: press Check again (without a phone) and look at the latest message below.")}</p>
          ) : (
            <p className="text-danger">
              {t("Refused:")} {r.test.explained ? `${r.test.explained}. ` : ""}
              <span className="break-all text-muted">{r.test.error}</span>
            </p>
          )}
        </div>
      )}
      {r && (
        <div>
          <div className="font-medium">{t("Last WhatsApp messages")}</div>
          {r.recent.sent.length ? (
            <ul className="text-muted">
              {r.recent.sent.map((m, i) => (
                <li key={i} className="break-words">
                  {when(m.at, t.locale)} · {m.template ?? "text"} · {m.delivery}
                  {m.status ? ` (${m.status})` : ""}
                  {m.error ? <span className="text-danger"> · {m.explained ?? m.error}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{t("None yet: every message so far went by email.")}</p>
          )}
        </div>
      )}
      {r && r.recent.byEmailInstead.length > 0 && (
        <div>
          <div className="font-medium">{t("Sent by email instead of WhatsApp")}</div>
          <ul className="text-muted">
            {r.recent.byEmailInstead.map((m, i) => (
              <li key={i} className="break-words">
                {when(m.at, t.locale)} · {m.explained ?? m.error ?? m.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
