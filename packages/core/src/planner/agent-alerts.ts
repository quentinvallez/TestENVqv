import { and, eq, schema } from "@viewing/db";
import { emailAgent } from "../channels";
import { automationSettings } from "../automations/rules";
import { recordEvent } from "../events";
import type { ToolContext } from "../tool";
import { formatSlot, toLang, type Lang } from "./language";

/*
 * The agent hears about every viewing or valuation visit a client books, moves
 * or cancels, by email to their own address. It needs no connected mailbox:
 * the mail goes from the agency's address (Mailgun EU), or else from the
 * agent's connected mailbox to themselves. Fixed text, no AI. Agencies can turn
 * it off (automations.agentAlerts). Changes made by someone in the app send
 * no email.
 */

const { agencySettings, appointments } = schema;

export type AgentAlert = { kind: "booked" | "cancelled" } | { kind: "rescheduled"; from: Date };

const subjects: Record<AgentAlert["kind"], Record<"viewing" | "valuation", Record<Lang, string>>> = {
  booked: {
    viewing: { nl: "Nieuw bezoek", fr: "Nouvelle visite", en: "New viewing" },
    valuation: { nl: "Nieuwe waardebepaling", fr: "Nouvelle estimation", en: "New valuation visit" },
  },
  rescheduled: {
    viewing: { nl: "Bezoek verplaatst", fr: "Visite déplacée", en: "Viewing moved" },
    valuation: { nl: "Waardebepaling verplaatst", fr: "Estimation déplacée", en: "Valuation visit moved" },
  },
  cancelled: {
    viewing: { nl: "Bezoek geannuleerd", fr: "Visite annulée", en: "Viewing cancelled" },
    valuation: { nl: "Waardebepaling geannuleerd", fr: "Estimation annulée", en: "Valuation visit cancelled" },
  },
};

const lines = {
  booked: {
    nl: (who: string, what: string, when: string) => `${who} heeft een ${what} geboekt op ${when}.`,
    fr: (who: string, what: string, when: string) => `${who} a réservé une ${what} le ${when}.`,
    en: (who: string, what: string, when: string) => `${who} booked a ${what} for ${when}.`,
  },
  rescheduled: {
    nl: (who: string, what: string, when: string, from: string) => `${who} heeft de ${what} van ${from} verplaatst naar ${when}.`,
    fr: (who: string, what: string, when: string, from: string) => `${who} a déplacé la ${what} du ${from} au ${when}.`,
    en: (who: string, what: string, when: string, from: string) => `${who} moved the ${what} from ${from} to ${when}.`,
  },
  cancelled: {
    nl: (who: string, what: string, when: string) => `${who} heeft de ${what} van ${when} geannuleerd.`,
    fr: (who: string, what: string, when: string) => `${who} a annulé la ${what} du ${when}.`,
    en: (who: string, what: string, when: string) => `${who} cancelled the ${what} on ${when}.`,
  },
};

const what = {
  viewing: { nl: "bezoek", fr: "visite", en: "viewing" },
  valuation: { nl: "waardebepaling", fr: "estimation", en: "valuation visit" },
};

const labels = {
  where: { nl: "Adres", fr: "Adresse", en: "Address" },
  client: { nl: "Klant", fr: "Client", en: "Client" },
  source: { nl: "Via", fr: "Via", en: "Via" },
  message: { nl: "Bericht", fr: "Message", en: "Message" },
  open: { nl: "Bekijk in de planning", fr: "Voir dans le planning", en: "Open in the planner" },
  footer: {
    nl: "Automatisch bericht. Uitzetten kan in Instellingen → Automatisaties.",
    fr: "Message automatique. Désactivable dans Paramètres → Automatisations.",
    en: "Automatic message. You can turn it off in Settings → Automations.",
  },
};

const sources: Record<string, string> = { website: "Website", immoweb: "Immoweb", zimmo: "Zimmo", immovlan: "Immovlan", whatsapp: "WhatsApp", phone: "Phone", manual: "Manual" };

/** The email to the agent, in their first language. Pure, for tests. */
export function agentAlertText(input: {
  action: AgentAlert;
  type: "viewing" | "valuation";
  lang: Lang;
  client: { name: string; email: string | null; phone: string | null };
  startsAt: Date;
  place: string;
  source: string | null;
  note: string | null;
  link: string;
}) {
  const { action, type, lang, client } = input;
  const when = formatSlot(input.startsAt, lang);
  const sentence =
    action.kind === "rescheduled"
      ? lines.rescheduled[lang](client.name, what[type][lang], when, formatSlot(action.from, lang))
      : lines[action.kind][lang](client.name, what[type][lang], when);
  const subject = `${subjects[action.kind][type][lang]}: ${input.place ? `${input.place}, ` : ""}${when}`;
  const text = [
    sentence,
    [
      input.place && `${labels.where[lang]}: ${input.place}`,
      `${labels.client[lang]}: ${[client.name, client.email, client.phone].filter(Boolean).join(" · ")}`,
      input.source && `${labels.source[lang]}: ${sources[input.source] ?? input.source}`,
      input.note && `${labels.message[lang]}: ${input.note}`,
    ]
      .filter(Boolean)
      .join("\n"),
    `${labels.open[lang]}: ${input.link}`,
    labels.footer[lang],
  ].join("\n\n");
  return { subject, text };
}

/** Emails the appointment's agent about a change. Never fails the booking itself. */
export async function alertAgent(ctx: ToolContext, appointmentId: string, action: AgentAlert) {
  // Only what the client did on their own (widget, booking link); changes made in the app are known already.
  if (ctx.actor.type !== "contact") return null;
  try {
    const [settings] = await ctx.db.select({ automations: agencySettings.automations }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    if (!automationSettings(settings?.automations).agentAlerts) return null;
    const apt = await ctx.db.query.appointments.findFirst({
      where: and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, appointmentId)),
      with: { agent: true, contact: true, listing: true, lead: true },
    });
    if (!apt?.agent?.email || (apt.type !== "viewing" && apt.type !== "valuation")) return null;
    const lang = toLang(apt.agent.languages[0]);
    const contact = apt.contact;
    const { absoluteUrl } = await import("./agent");
    const { subject, text } = agentAlertText({
      action,
      type: apt.type === "valuation" ? "valuation" : "viewing",
      lang,
      client: {
        name: [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || { nl: "Een klant", fr: "Un client", en: "A client" }[lang],
        email: contact?.email ?? null,
        phone: contact?.phone ?? null,
      },
      startsAt: apt.startsAt,
      place: apt.location ?? "",
      source: apt.lead?.source ?? null,
      note: action.kind === "booked" ? (apt.notes ?? null) : null,
      link: absoluteUrl("/appointments"),
    });
    const sent = await emailAgent(ctx, { agentId: apt.agent.id, subject, text });
    await recordEvent(ctx, {
      type: "agent.alerted",
      subjectType: "appointment",
      subjectId: apt.id,
      data: { agentId: apt.agent.id, action: action.kind, delivery: sent.delivery, transport: sent.transport, ...(sent.error && { error: sent.error }) },
    });
    return sent;
  } catch (error) {
    console.error("Agent alert failed", error);
    return null;
  }
}
