import { and, eq, inArray, isNull, notExists, schema, sql } from "@viewing/db";
import type { Language } from "@viewing/db/schema";
import { z } from "zod";
import { absoluteUrl, pickSpreadSlots } from "../planner/agent";
import { composeMessage, detailLabels, formatSlot, linkLabels, occupantLabels, occupantSubject, occupantTemplates, signature, templates, toLang, type Lang } from "../planner/language";
import { availableSlots } from "./booking";
import { runTool } from "../tool";
import { requestValuation, verifyValuation } from "./valuations";
import { zonedDay, zonedTime } from "../time";
import { defineTool } from "../tool";
import { recordEvent } from "../events";

const { offices, agents, availabilityRules, listings, contacts, leads, appointments, events, proposals, conversations, messages, valuations, automationRuns, websitePages, calendarConnections, agencySettings } = schema;

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=70`;

/**
 * Fills an empty agency with realistic Belgian sample data so a new workspace
 * (or a preview environment) can be explored immediately.
 */
export const seedDemoData = defineTool({
  name: "demo_seed",
  description: "Fill an empty agency with sample offices, agents, listings, leads and viewings.",
  mutates: true,
  input: z.object({}),
  run: async (ctx) => {
    const agencyId = ctx.agencyId;
    const [existing] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(listings)
      .where(eq(listings.agencyId, agencyId));
    if ((existing?.n ?? 0) > 0) return { seeded: false, reason: "Agency already has listings" };

    const monthsAgo = (m: number) => new Date(Date.now() - m * 30 * 24 * 3600 * 1000);
    const soldHistory: { type: "house" | "apartment" | "villa"; street: string; number: string; postcode: string; city: string; asking: number; price: number; months: number; area: number; bedrooms: number; epc: string; condition: string }[] = [
      { type: "house", street: "Statiestraat", number: "41", postcode: "2600", city: "Berchem", asking: 489000, price: 475000, months: 4, area: 165, bedrooms: 3, epc: "C", condition: "good" },
      { type: "house", street: "Driekoningenstraat", number: "88", postcode: "2600", city: "Berchem", asking: 529000, price: 520000, months: 9, area: 178, bedrooms: 4, epc: "B", condition: "renovated" },
      { type: "house", street: "Diepestraat", number: "12", postcode: "2600", city: "Berchem", asking: 399000, price: 382000, months: 14, area: 140, bedrooms: 3, epc: "E", condition: "to_renovate" },
      { type: "apartment", street: "Grote Steenweg", number: "205", postcode: "2600", city: "Berchem", asking: 289000, price: 281000, months: 6, area: 85, bedrooms: 2, epc: "B", condition: "good" },
      { type: "apartment", street: "Cogels-Osylei", number: "71", postcode: "2600", city: "Berchem", asking: 365000, price: 355000, months: 11, area: 102, bedrooms: 2, epc: "C", condition: "renovated" },
      { type: "house", street: "Koningsstraat", number: "9", postcode: "9000", city: "Gent", asking: 595000, price: 580000, months: 5, area: 190, bedrooms: 4, epc: "C", condition: "good" },
      { type: "house", street: "Sint-Pietersnieuwstraat", number: "120", postcode: "9000", city: "Gent", asking: 455000, price: 440000, months: 8, area: 150, bedrooms: 3, epc: "D", condition: "good" },
      { type: "house", street: "Hundelgemsesteenweg", number: "322", postcode: "9820", city: "Merelbeke", asking: 419000, price: 405000, months: 7, area: 160, bedrooms: 3, epc: "D", condition: "good" },
      { type: "house", street: "Gaversesteenweg", number: "15", postcode: "9820", city: "Merelbeke", asking: 375000, price: 362000, months: 13, area: 145, bedrooms: 3, epc: "E", condition: "to_renovate" },
      { type: "apartment", street: "Kortrijksesteenweg", number: "180", postcode: "9000", city: "Gent", asking: 269000, price: 262000, months: 3, area: 78, bedrooms: 2, epc: "B", condition: "good" },
    ];
    const seeded = await ctx.db.transaction(async (tx) => {
      const [antwerp, ghent] = await tx
        .insert(offices)
        .values([
          { agencyId, name: "Antwerpen", street: "Meir 24", postcode: "2000", city: "Antwerpen", phone: "+32 3 123 45 67" },
          { agencyId, name: "Gent", street: "Veldstraat 61", postcode: "9000", city: "Gent", phone: "+32 9 123 45 67" },
        ])
        .returning();

      const demoAgents = [
        { agencyId, officeId: antwerp!.id, name: "Sofie Peeters", email: "sofie@demo-agency.be", phone: "+32 470 11 22 33", color: "#6366f1", languages: ["nl", "en"] as Language[] },
        { agencyId, officeId: antwerp!.id, name: "Thomas Janssens", email: "thomas@demo-agency.be", phone: "+32 471 22 33 44", color: "#10b981", languages: ["nl", "fr"] as Language[] },
        { agencyId, officeId: ghent!.id, name: "Lien De Smet", email: "lien@demo-agency.be", phone: "+32 472 33 44 55", color: "#f59e0b", languages: ["nl", "en"] as Language[] },
        { agencyId, officeId: ghent!.id, name: "Maxime Dubois", email: "maxime@demo-agency.be", phone: "+32 473 44 55 66", color: "#ec4899", languages: ["fr", "nl"] as Language[] },
      ];
      // Demo agents kept by a reset (a connected calendar) are reused, with their own hours.
      const kept = await tx
        .select()
        .from(agents)
        .where(and(eq(agents.agencyId, agencyId), inArray(agents.email, demoAgents.map((a) => a.email))));
      for (const agent of kept) {
        await tx.update(agents).set({ officeId: demoAgents.find((a) => a.email === agent.email)!.officeId }).where(eq(agents.id, agent.id));
      }
      const missing = demoAgents.filter((a) => !kept.some((k) => k.email === a.email));
      const inserted = missing.length ? await tx.insert(agents).values(missing).returning() : [];
      const agentRows = demoAgents.map((a) => [...kept, ...inserted].find((row) => row.email === a.email)!);
      const [sofie, thomas, lien, maxime] = agentRows;

      if (inserted.length) {
        await tx.insert(availabilityRules).values(
          inserted.flatMap((agent) =>
            [1, 2, 3, 4, 5].map((weekday) => ({ agencyId, agentId: agent.id, weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
          ),
        );
      }

      const listingRows = await tx
        .insert(listings)
        .values([
          { agencyId, officeId: antwerp!.id, agentId: sofie!.id, reference: "ANT-1042", status: "active", transaction: "sale", propertyType: "apartment", title: "Lichtrijk appartement met terras", street: "Cogels-Osylei", houseNumber: "38", postcode: "2600", city: "Berchem", price: 395000, bedrooms: 2, bathrooms: 1, livingArea: 98, epcScore: 142, epcLabel: "B", photos: [{ url: photo("1502672260266-1c1ef2d93688") }], portalRefs: { immoweb: "21004871" } },
          { agencyId, officeId: antwerp!.id, agentId: sofie!.id, reference: "ANT-1043", status: "active", transaction: "sale", propertyType: "house", title: "Gerenoveerde burgerwoning met tuin", street: "Grote Steenweg", houseNumber: "112", postcode: "2600", city: "Berchem", price: 549000, bedrooms: 4, bathrooms: 2, livingArea: 186, plotArea: 210, epcScore: 168, epcLabel: "B", photos: [{ url: photo("1568605114967-8130f3a36994") }], portalRefs: { immoweb: "21004872" } },
          { agencyId, officeId: antwerp!.id, agentId: thomas!.id, reference: "ANT-1051", status: "active", transaction: "rent", propertyType: "apartment", title: "Penthouse aan het Eilandje", street: "Londenstraat", houseNumber: "7", postcode: "2000", city: "Antwerpen", price: 1650, bedrooms: 2, bathrooms: 2, livingArea: 120, epcScore: 64, epcLabel: "A", photos: [{ url: photo("1545324418-cc1a3fa10c00") }], portalRefs: { immoweb: "21004890" } },
          { agencyId, officeId: antwerp!.id, agentId: thomas!.id, reference: "ANT-1055", status: "under_offer", transaction: "sale", propertyType: "villa", title: "Moderne villa in het groen", street: "Kapellensteenweg", houseNumber: "301", postcode: "2930", city: "Brasschaat", price: 975000, bedrooms: 5, bathrooms: 3, livingArea: 320, plotArea: 1850, epcScore: 88, epcLabel: "A", photos: [{ url: photo("1613490493576-7fde63acd811") }] },
          { agencyId, officeId: ghent!.id, agentId: lien!.id, reference: "GNT-2011", status: "active", access: "owner", viewingNoticeHours: 24, transaction: "sale", propertyType: "house", title: "Karaktervolle herenwoning", street: "Coupure Links", houseNumber: "55", postcode: "9000", city: "Gent", price: 785000, bedrooms: 4, bathrooms: 2, livingArea: 240, plotArea: 160, epcScore: 245, epcLabel: "C", photos: [{ url: photo("1600596542815-ffad4c1539a9") }], portalRefs: { immoweb: "21005120" } },
          { agencyId, officeId: ghent!.id, agentId: lien!.id, reference: "GNT-2014", status: "active", transaction: "rent", propertyType: "apartment", title: "Studio vlakbij Gent-Sint-Pieters", street: "Kortrijksesteenweg", houseNumber: "210", postcode: "9000", city: "Gent", price: 795, bedrooms: 0, bathrooms: 1, livingArea: 38, epcScore: 190, epcLabel: "C", photos: [{ url: photo("1522708323590-d24dbb6b0267") }] },
          { agencyId, officeId: ghent!.id, agentId: maxime!.id, reference: "GNT-2020", status: "active", transaction: "sale", propertyType: "house", title: "Halfopen bebouwing met grote tuin", street: "Hundelgemsesteenweg", houseNumber: "480", postcode: "9820", city: "Merelbeke", price: 435000, bedrooms: 3, bathrooms: 1, livingArea: 165, plotArea: 640, epcScore: 310, epcLabel: "D", photos: [{ url: photo("1570129477492-45c003edd2be") }], portalRefs: { immoweb: "21005177" } },
          { agencyId, officeId: ghent!.id, agentId: maxime!.id, reference: "GNT-2023", status: "draft", transaction: "sale", propertyType: "land", title: "Bouwgrond voor open bebouwing", street: "Pontstraat", houseNumber: "12", postcode: "9831", city: "Sint-Martens-Latem", price: 389000, plotArea: 1100, photos: [{ url: photo("1500382017468-9049fed747ef") }] },
          { agencyId, officeId: antwerp!.id, agentId: sofie!.id, reference: "ANT-0998", status: "sold", transaction: "sale", propertyType: "apartment", title: "Appartement aan het Zuid", street: "Vlaamsekaai", houseNumber: "16", postcode: "2000", city: "Antwerpen", price: 425000, soldPrice: 418000, soldAt: monthsAgo(3), bedrooms: 2, bathrooms: 1, livingArea: 104, epcScore: 120, epcLabel: "B", photos: [{ url: photo("1493809842364-78817add7ffb") }] },
          // Earlier sales of the demo agency; valuations use them as nearby comparables.
          ...soldHistory.map((h, i) => ({
            agencyId,
            officeId: h.postcode.startsWith("2") ? antwerp!.id : ghent!.id,
            agentId: (h.postcode.startsWith("2") ? sofie! : lien!).id,
            reference: `SOLD-${100 + i}`,
            status: "sold" as const,
            transaction: "sale" as const,
            propertyType: h.type,
            street: h.street,
            houseNumber: h.number,
            postcode: h.postcode,
            city: h.city,
            price: h.asking,
            soldPrice: h.price,
            soldAt: monthsAgo(h.months),
            livingArea: h.area,
            bedrooms: h.bedrooms,
            epcLabel: h.epc,
            features: { condition: h.condition },
          })),
        ])
        .returning();
      const byRef = Object.fromEntries(listingRows.map((l) => [l.reference, l]));

      // The Ghent townhouse is lived in: its owner gave the times it can be visited through her link.
      const [owner] = await tx
        .insert(contacts)
        .values({ agencyId, firstName: "Hilde", lastName: "Verstraete", email: "hilde.verstraete@example.com", phone: "+32 478 11 22 33", language: "nl" })
        .returning();
      await tx.insert(schema.listingOccupants).values({ agencyId, listingId: byRef["GNT-2011"]!.id, contactId: owner!.id, role: "owner" });
      await tx.insert(schema.listingWindows).values(
        [2, 4].map((weekday) => ({ agencyId, listingId: byRef["GNT-2011"]!.id, weekday, startMinute: 15 * 60, endMinute: 18 * 60 })),
      );

      const people: [string, string, string, "nl" | "fr" | "en" | "de"][] = [
        ["Emma", "Claes", "emma.claes@example.com", "nl"],
        ["Lucas", "Maes", "lucas.maes@example.com", "nl"],
        ["Camille", "Lambert", "camille.lambert@example.com", "fr"],
        ["Noah", "Wouters", "noah.wouters@example.com", "nl"],
        ["Julie", "Mertens", "julie.mertens@example.com", "nl"],
        ["Arthur", "Dupont", "arthur.dupont@example.com", "fr"],
        ["Olivia", "Jacobs", "olivia.jacobs@example.com", "en"],
        ["Louis", "Willems", "louis.willems@example.com", "nl"],
        ["Marie", "Goossens", "marie.goossens@example.com", "nl"],
        ["Victor", "Leroy", "victor.leroy@example.com", "fr"],
        ["Lotte", "Hermans", "lotte.hermans@example.com", "nl"],
        ["Jules", "Martin", "jules.martin@example.com", "fr"],
      ];
      const contactRows = await tx
        .insert(contacts)
        .values(
          people.map(([firstName, lastName, email, language], i) => ({
            agencyId,
            firstName,
            lastName,
            email,
            language,
            phone: `+32 47${i % 10} ${String(10 + i).padStart(2, "0")} ${String(20 + i * 3).padStart(2, "0")} ${String(30 + i * 2).padStart(2, "0")}`,
            whatsappOptIn: i % 3 !== 0,
          })),
        )
        .returning();

      type Stage = "new" | "invited" | "booked" | "visited" | "follow_up" | "offer";
      const leadPlan: [number, string, Stage, "immoweb" | "zimmo" | "immovlan" | "website", string][] = [
        [0, "ANT-1042", "invited", "immoweb", "Is het appartement nog beschikbaar? Graag een bezoek."],
        [1, "ANT-1043", "invited", "immoweb", "Wij zijn geïnteresseerd en willen graag komen kijken."],
        [2, "GNT-2011", "invited", "zimmo", "Bonjour, je souhaiterais visiter ce bien."],
        [3, "ANT-1051", "invited", "immovlan", "Is het penthouse nog te huur? Ik zou het graag bezichtigen."],
        [4, "GNT-2011", "invited", "website", "Graag meer info over de tuin en de EPC."],
        [5, "ANT-1042", "booked", "immoweb", "Je voudrais visiter samedi si possible."],
        [6, "GNT-2014", "booked", "website", "Hi, I'd like to see the studio this week."],
        [7, "ANT-1043", "booked", "immoweb", "Kan ik dinsdag na 17u langskomen?"],
        [8, "GNT-2011", "visited", "immoweb", "Bezoek gehad, denken erover na."],
        [9, "ANT-1055", "follow_up", "zimmo", "Nous aimerions une deuxième visite."],
        [10, "ANT-1055", "offer", "website", "Wij willen een bod uitbrengen."],
        [11, "GNT-2020", "visited", "immoweb", "Merci pour la visite."],
      ];
      const leadRows = await tx
        .insert(leads)
        .values(
          leadPlan.map(([contact, ref, stage, source, message], i) => ({
            agencyId,
            contactId: contactRows[contact]!.id,
            listingId: byRef[ref]!.id,
            agentId: byRef[ref]!.agentId,
            stage,
            source,
            message,
            createdAt: new Date(Date.now() - (i + 1) * 9 * 3600 * 1000),
          })),
        )
        .returning();

      // Viewings spread over the coming days at office-hour times.
      const at = (dayOffset: number, hour: number, minute = 0) => zonedTime({ ...zonedDay(new Date(), dayOffset), hour, minute });
      const appointmentPlan: [number, number, number, number, "scheduled" | "confirmed" | "completed" | "no_show" | "cancelled"][] = [
        [5, 0, 10, 0, "confirmed"],
        [6, 0, 14, 30, "confirmed"],
        [7, 1, 17, 30, "scheduled"],
        [5, 2, 11, 0, "scheduled"],
        [8, -2, 15, 0, "completed"],
        [11, -1, 10, 30, "no_show"],
        [4, 2, 16, 0, "cancelled"],
        [9, 3, 16, 0, "confirmed"],
      ];
      const appointmentRows = await tx
        .insert(appointments)
        .values(
          appointmentPlan.map(([leadIndex, day, hour, minute, status]) => {
            const lead = leadRows[leadIndex]!;
            const listing = listingRows.find((l) => l.id === lead.listingId)!;
            const startsAt = at(day, hour, minute);
            return {
              agencyId,
              agentId: lead.agentId!,
              listingId: listing.id,
              contactId: lead.contactId,
              leadId: lead.id,
              type: "viewing" as const,
              status,
              startsAt,
              endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
              location: `${listing.street} ${listing.houseNumber}, ${listing.postcode} ${listing.city}`,
              // Booked when the lead came in, so the day-before reminder applies.
              createdAt: lead.createdAt,
            };
          }),
        )
        .returning();

      await tx.insert(events).values([
        ...leadRows.map((lead) => ({
          agencyId,
          type: "lead.created",
          subjectType: "lead",
          subjectId: lead.id,
          actorType: "system" as const,
          data: { source: lead.source },
          createdAt: lead.createdAt,
        })),
        ...appointmentRows.map((apt, i) => ({
          agencyId,
          type: "appointment.booked",
          subjectType: "appointment",
          subjectId: apt.id,
          actorType: "contact" as const,
          data: {},
          createdAt: new Date(Date.now() - (i + 1) * 5 * 3600 * 1000),
        })),
      ]);

      // What clients told the booking widget.
      const answers = (pairs: [string, string][]) => ({ answers: pairs.map(([question, answer]) => ({ id: question, question, answer })) });
      const qualified: [number, ReturnType<typeof answers> & { temperature: "hot" | "warm" | "cold" }][] = [
        [0, { ...answers([["What are you looking for?", "To live in"], ["Do you have mortgage approval?", "Yes"], ["Do you need to sell your current home first?", "No"], ["When would you like to buy?", "Within 3 months"]]), temperature: "hot" }],
        [7, { ...answers([["What are you looking for?", "To live in"], ["Do you have mortgage approval?", "In progress"], ["When would you like to buy?", "3 to 6 months"]]), temperature: "warm" }],
        [6, { ...answers([["When would you like to move in?", "As soon as possible"], ["How many people?", "1"], ["Do you have pets?", "No"]]), temperature: "hot" }],
        [9, { ...answers([["What are you looking for?", "To live in"], ["Do you have mortgage approval?", "Yes"], ["When would you like to buy?", "Within 3 months"]]), temperature: "hot" }],
        [11, { ...answers([["What are you looking for?", "To live in"], ["Do you have mortgage approval?", "Not yet"], ["When would you like to buy?", "Later"]]), temperature: "cold" }],
      ];
      for (const [index, qualification] of qualified) {
        await tx.update(leads).set({ qualification }).where(eq(leads.id, leadRows[index]!.id));
      }

      return { leadRows, appointmentRows, listingRows, contactRows, owner: owner! };
    });

    // The inbox shows what the planner does on its own: portal leads with the automatic reply, website bookings with
    // their confirmation, and the reminders, follow-ups, new times after a no-show, check-ins and owner alerts it sent.
    // Rows are written directly (never through sendMessage), so loading the demo never emails or texts anyone.
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);
    const { leadRows, appointmentRows, contactRows, listingRows, owner } = seeded;
    const agency = await ctx.db.query.organization.findFirst({ where: eq(schema.organization.id, agencyId), columns: { name: true } });
    const agencyName = agency?.name ?? "";
    const agentRows = await ctx.db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.agencyId, agencyId));
    const agentName = (id: string | null) => agentRows.find((a) => a.id === id)?.name ?? agencyName;
    const listingOf = (id: string | null) => listingRows.find((l) => l.id === id)!;
    const place = (l: { street: string | null; houseNumber: string | null; city: string | null }) => `${[l.street, l.houseNumber].filter(Boolean).join(" ")}, ${l.city}`;
    const freeTimes = async (listingId: string) => pickSpreadSlots((await runTool(availableSlots, ctx, { listingId, days: 14 })).slots);
    const aptOf = (leadIndex: number, status?: string) => appointmentRows.find((a) => a.leadId === leadRows[leadIndex]!.id && (!status || a.status === status))!;

    type Line =
      | { from: "client"; hoursAgo: number; body: string; portal?: string }
      | { from: "system"; hoursAgo: number; body: string; intent?: string; kind?: string }
      | { from: "planner"; hoursAgo: number; body: string; kind: string; template?: string };
    type Seed = {
      contactId: string;
      leadIndex?: number;
      listingId: string | null;
      agentId: string | null;
      channel: "email" | "whatsapp";
      subject?: string;
      category: "viewing_request" | "booking" | "confirmation" | "feedback" | "cancellation";
      summary: string;
      unread?: boolean;
      lines: Line[];
    };

    /** The fixed text the planner sends for this kind of message, exactly as composeMessage builds it. */
    const fixed = (lang: Lang, key: string, v: { name: string; address: string; agentName: string; other?: string }, channel: "email" | "whatsapp", extra: { slots?: Date[]; details?: { label: string; value: string }[]; link?: { url: string; label: string } } = {}) =>
      composeMessage({ lang, body: templates[key]![lang](v), ...extra, signature: signature(lang, v.agentName, agencyName, channel === "email" ? "email" : "whatsapp") });

    const threads: Seed[] = [];
    // Portal leads asking to visit an active listing, answered at once with free times and the booking link.
    const portalLeads: [number, string, number, string, string][] = [
      [1, "Immoweb", 0.4, "Immoweb – Contactaanvraag voor ANT-1043, Grote Steenweg 112", "Goedendag,\n\nWij zijn geïnteresseerd in de woning aan de Grote Steenweg en willen graag eens komen kijken. Liefst op een weekdag na 17u.\n\nMet vriendelijke groeten,\nLucas Maes\n0471 11 23 32"],
      [0, "Immoweb", 2, "Immoweb – Contactaanvraag voor ANT-1042, Cogels-Osylei 38", "Goedemiddag,\n\nIs het appartement aan de Cogels-Osylei nog beschikbaar? We zouden het graag eens komen bekijken, bij voorkeur volgende week.\n\nGroeten,\nEmma Claes"],
      [2, "Zimmo", 5, "Zimmo – Nouvelle demande pour GNT-2011, Coupure Links 55", "Bonjour,\n\nJe souhaiterais visiter la maison Coupure Links. Je suis disponible en fin d'après-midi.\n\nMerci,\nCamille Lambert"],
      [3, "Immovlan", 100, "Immovlan – Aanvraag voor ANT-1051, Londenstraat 7", "Hallo,\n\nIs het penthouse nog te huur? Ik zou het graag bezichtigen.\n\nNoah Wouters"],
    ];
    for (const [leadIndex, portal, ago, subject, body] of portalLeads) {
      const lead = leadRows[leadIndex]!;
      const contact = contactRows.find((c) => c.id === lead.contactId)!;
      const lang = toLang(contact.language);
      const listing = listingOf(lead.listingId);
      const vars = { name: contact.firstName ?? "", address: place(listing), agentName: agentName(lead.agentId) };
      const lines: Line[] = [
        { from: "client", hoursAgo: ago, body, portal: portal.toLowerCase() },
        { from: "planner", hoursAgo: ago - 0.02, kind: "portal_reply", body: fixed(lang, "viewing_request", vars, "email", { slots: await freeTimes(listing.id), link: { url: absoluteUrl(`/book/${listing.id}`), label: linkLabels.book[lang] } }) },
      ];
      // No answer after a few days: the planner checks in once, with fresh times.
      if (ago > 72) {
        lines.push({ from: "planner", hoursAgo: ago - 72, kind: "nudge", body: fixed(lang, "nudge_invited", vars, "email", { slots: await freeTimes(listing.id), link: { url: absoluteUrl(`/book/${listing.id}`), label: linkLabels.book[lang] } }) });
      }
      threads.push({
        contactId: contact.id,
        leadIndex,
        listingId: listing.id,
        agentId: lead.agentId,
        channel: "email",
        subject,
        category: "viewing_request",
        summary: ago > 72 ? `${portal} lead; booking link sent, checked in after 3 days without an answer.` : `${portal} lead asking to visit; free times and the booking link sent.`,
        unread: ago < 1,
        lines,
      });
    }

    // Website bookings, each confirmed on its own (WhatsApp when the client asked for it), and the reminder the day before.
    const bookings: [number, number, boolean][] = [
      [6, 30, false],
      [7, 40, true],
    ];
    for (const [leadIndex, ago, withReminder] of bookings) {
      const lead = leadRows[leadIndex]!;
      const contact = contactRows.find((c) => c.id === lead.contactId)!;
      const lang = toLang(contact.language);
      const apt = aptOf(leadIndex);
      const listing = listingOf(apt.listingId);
      const channel = contact.whatsappOptIn ? "whatsapp" : "email";
      const vars = { name: contact.firstName ?? "", address: place(listing), agentName: agentName(apt.agentId) };
      const details = [
        { label: detailLabels.when[lang], value: formatSlot(apt.startsAt, lang) },
        { label: detailLabels.where[lang], value: apt.location ?? place(listing) },
        { label: detailLabels.with[lang], value: vars.agentName },
      ];
      const change = { url: absoluteUrl(`/a/${apt.manageToken}`), label: linkLabels.change[lang] };
      const lines: Line[] = [
        { from: "system", hoursAgo: ago, intent: "booking", body: `Booked a viewing at ${place(listing)} for ${formatSlot(apt.startsAt, "en")} on the website.` },
        { from: "planner", hoursAgo: ago - 0.01, kind: "booking_confirmation", template: channel === "whatsapp" ? "booking_confirmed" : undefined, body: fixed(lang, "booking_confirmation", vars, channel, { details, link: change }) },
      ];
      if (withReminder) lines.push({ from: "planner", hoursAgo: 1, kind: "reminder", template: "viewing_reminder", body: fixed(lang, "reminder", vars, channel, { details, link: change }) });
      threads.push({
        contactId: contact.id,
        leadIndex,
        listingId: listing.id,
        agentId: apt.agentId,
        channel,
        subject: channel === "email" ? listing.title ?? undefined : undefined,
        category: "booking",
        summary: withReminder ? "Booked on the website; confirmed and reminded the day before." : "Booked on the website; confirmation sent.",
        lines,
      });
    }

    // The day after a viewing: the follow-up.
    {
      const apt = aptOf(8, "completed");
      const contact = contactRows.find((c) => c.id === apt.contactId)!;
      const lang = toLang(contact.language);
      const listing = listingOf(apt.listingId);
      const vars = { name: contact.firstName ?? "", address: place(listing), agentName: agentName(apt.agentId) };
      threads.push({
        contactId: contact.id,
        leadIndex: 8,
        listingId: listing.id,
        agentId: apt.agentId,
        channel: contact.whatsappOptIn ? "whatsapp" : "email",
        subject: contact.whatsappOptIn ? undefined : "Uw bezoek",
        category: "feedback",
        summary: "Viewed two days ago; follow-up sent the next day.",
        lines: [{ from: "planner", hoursAgo: 20, kind: "follow_up", body: fixed(lang, "follow_up", vars, contact.whatsappOptIn ? "whatsapp" : "email") }],
      });
    }

    // A client who didn't come: the agent marked it, the planner offered new times.
    {
      const apt = aptOf(11, "no_show");
      const contact = contactRows.find((c) => c.id === apt.contactId)!;
      const lang = toLang(contact.language);
      const listing = listingOf(apt.listingId);
      const channel = contact.whatsappOptIn ? "whatsapp" : "email";
      const vars = { name: contact.firstName ?? "", address: place(listing), agentName: agentName(apt.agentId) };
      threads.push({
        contactId: contact.id,
        leadIndex: 11,
        listingId: listing.id,
        agentId: apt.agentId,
        channel,
        category: "cancellation",
        summary: "Didn't come to the viewing; new times sent.",
        lines: [
          { from: "system", hoursAgo: 22, kind: "no_show", body: `Didn't show up for the viewing on ${formatSlot(apt.startsAt, "en")}.` },
          { from: "planner", hoursAgo: 21.9, kind: "no_show", template: channel === "whatsapp" ? "no_show_rebook" : undefined, body: fixed(lang, "no_show", vars, channel, { slots: await freeTimes(listing.id), link: { url: absoluteUrl(`/book/${listing.id}`), label: linkLabels.book[lang] } }) },
        ],
      });
    }

    // The same visitor's side: they cancelled with their link and got new times on their own.
    {
      const apt = aptOf(4, "cancelled");
      const contact = contactRows.find((c) => c.id === apt.contactId)!;
      const lang = toLang(contact.language);
      const listing = listingOf(apt.listingId);
      const vars = { name: contact.firstName ?? "", address: place(listing), agentName: agentName(apt.agentId) };
      threads.push({
        contactId: contact.id,
        leadIndex: 4,
        listingId: listing.id,
        agentId: apt.agentId,
        channel: "email",
        subject: listing.title ?? undefined,
        category: "cancellation",
        summary: "Cancelled with their link; new times sent.",
        lines: [
          { from: "system", hoursAgo: 3, kind: "client_action", body: `Cancelled the viewing at ${place(listing)} (${formatSlot(apt.startsAt, "en")}) using their booking link.` },
          { from: "planner", hoursAgo: 2.95, kind: "cancellation_reply", body: fixed(lang, "cancelled_by_client", vars, "email", { slots: await freeTimes(listing.id), link: { url: absoluteUrl(`/book/${listing.id}`), label: linkLabels.book[lang] } }) },
        ],
      });
    }

    // A visitor cancelled with their link: the owner who lives there is told on their own.
    {
      const apt = aptOf(4, "cancelled");
      const listing = listingOf(apt.listingId);
      const occupant = await ctx.db.query.listingOccupants.findFirst({ where: and(eq(schema.listingOccupants.agencyId, agencyId), eq(schema.listingOccupants.contactId, owner.id)) });
      const lang = toLang(owner.language);
      const name = agentName(apt.agentId);
      threads.push({
        contactId: owner.id,
        listingId: listing.id,
        agentId: apt.agentId,
        channel: "email",
        subject: occupantSubject.cancelled[lang],
        category: "cancellation",
        summary: "A visitor cancelled; the owner was told.",
        lines: [
          {
            from: "planner",
            hoursAgo: 3,
            kind: "occupant_cancelled",
            body: composeMessage({
              lang,
              body: occupantTemplates.cancelled[lang]({ name: owner.firstName ?? "", address: place(listing), agentName: name, other: formatSlot(apt.startsAt, lang) }),
              link: { url: absoluteUrl(`/s/${occupant!.token}`), label: occupantLabels.page[lang] },
              signature: signature(lang, name, agencyName, "email"),
            }),
          },
        ],
      });
    }

    const transportOf = (channel: "email" | "whatsapp", agentId: string | null) =>
      channel === "whatsapp" ? "whatsapp_cloud" : agentRows.findIndex((a) => a.id === agentId) % 2 === 0 ? "outlook" : "gmail";
    for (const thread of threads) {
      const last = thread.lines[thread.lines.length - 1]!;
      const transport = transportOf(thread.channel, thread.agentId);
      const [conversation] = await ctx.db
        .insert(conversations)
        .values({
          agencyId,
          contactId: thread.contactId,
          leadId: thread.leadIndex !== undefined ? leadRows[thread.leadIndex]!.id : null,
          listingId: thread.listingId,
          agentId: thread.agentId,
          channel: thread.channel,
          provider: thread.channel === "whatsapp" ? "whatsapp_business" : (transport as "outlook" | "gmail"),
          subject: thread.subject,
          status: "waiting",
          category: thread.category,
          summary: thread.summary,
          priority: "normal",
          unread: thread.unread ?? false,
          lastMessageAt: hoursAgo(last.hoursAgo),
        })
        .returning();
      await ctx.db.insert(messages).values(
        thread.lines.map((line) => ({
          agencyId,
          conversationId: conversation!.id,
          direction: line.from === "planner" ? ("outbound" as const) : ("inbound" as const),
          authorType: line.from === "client" ? ("contact" as const) : line.from === "system" ? ("system" as const) : ("agent" as const),
          // Demo rows show as sent so the inbox looks like a connected agency; nothing actually left the platform.
          delivery: line.from === "planner" ? ("sent" as const) : null,
          subject: thread.channel === "email" ? thread.subject : null,
          body: line.body,
          intent: line.from === "system" ? (line.intent ?? null) : null,
          metadata:
            line.from === "planner"
              ? { kind: line.kind, transport, demo: true, ...(line.template && thread.channel === "whatsapp" && { template: line.template }) }
              : line.from === "client"
                ? { ...(line.portal && { portal: line.portal }) }
                : { ...(line.kind && { kind: line.kind }) },
          sentAt: hoursAgo(line.hoursAgo),
        })),
      );
    }

    // The jobs see these as done, so they don't send them again.
    const reminded = aptOf(7);
    await ctx.db.insert(automationRuns).values([
      { agencyId, rule: "reminder" as const, subjectType: "appointment", subjectId: reminded.id, dueKey: reminded.startsAt.toISOString(), outcome: "sent" as const, detail: { demo: true } },
      { agencyId, rule: "follow_up" as const, subjectType: "appointment", subjectId: aptOf(8, "completed").id, dueKey: "after_viewing", outcome: "sent" as const, detail: { demo: true } },
      { agencyId, rule: "no_show" as const, subjectType: "appointment", subjectId: aptOf(11, "no_show").id, dueKey: aptOf(11, "no_show").startsAt.toISOString(), outcome: "sent" as const, detail: { demo: true } },
    ]);

    // An owner who asked for an estimate on the demo website yesterday.
    const valuation = await runTool(requestValuation, { ...ctx, actor: { type: "contact", id: null } }, {
      street: "Diepestraat",
      houseNumber: "30",
      postcode: "2600",
      city: "Berchem",
      firstName: "Katrien",
      email: "katrien.vermeiren@example.com",
      phone: "+32 475 98 76 54",
      language: "nl",
      consent: true,
      answers: { propertyType: "house", livingArea: 155, plotArea: 180, bedrooms: 3, bathrooms: 1, condition: "good", epcLabel: "D", kitchen: "standard", extras: ["garden"], plans: "sell_soon" },
    });
    if (valuation.demoCode) {
      await runTool(verifyValuation, { ...ctx, actor: { type: "contact", id: null } }, { token: valuation.token, code: valuation.demoCode, useAi: false });
    }
    // The seller lead stays on the board; its draft follow-up stays out of the demo inbox, which only shows what was sent on its own.
    const [requested] = await ctx.db.select({ contactId: valuations.contactId }).from(valuations).where(eq(valuations.token, valuation.token));
    if (requested?.contactId) {
      await ctx.db.delete(conversations).where(and(eq(conversations.agencyId, agencyId), eq(conversations.contactId, requested.contactId)));
      await ctx.db.delete(proposals).where(and(eq(proposals.agencyId, agencyId), eq(proposals.status, "pending")));
    }

    return { seeded: true, listings: seeded.listingRows.length, leads: leadRows.length, appointments: appointmentRows.length, conversations: threads.length };
  },
});

/**
 * Takes the workspace back to the demo: clears listings, website import, contacts, leads, viewings,
 * conversations, drafts and history, then loads the demo data again. Agents with a login or a
 * connected calendar stay, so connections aren't lost.
 */
export const resetToDemoData = defineTool({
  name: "demo_reset",
  description: "Replace the agency's data with the demo data. Deletes listings, the website import, contacts, leads, viewings, conversations and drafts; keeps agents with a login or a connected calendar.",
  mutates: true,
  input: z.object({}),
  run: async (ctx) => {
    const agencyId = ctx.agencyId;
    await ctx.db.transaction(async (tx) => {
      await tx.delete(proposals).where(eq(proposals.agencyId, agencyId));
      await tx.delete(messages).where(eq(messages.agencyId, agencyId));
      await tx.delete(conversations).where(eq(conversations.agencyId, agencyId));
      await tx.delete(automationRuns).where(eq(automationRuns.agencyId, agencyId));
      await tx.delete(valuations).where(eq(valuations.agencyId, agencyId));
      await tx.delete(appointments).where(eq(appointments.agencyId, agencyId));
      await tx.delete(leads).where(eq(leads.agencyId, agencyId));
      await tx.delete(contacts).where(eq(contacts.agencyId, agencyId));
      await tx.delete(websitePages).where(eq(websitePages.agencyId, agencyId));
      await tx.delete(listings).where(eq(listings.agencyId, agencyId));
      await tx
        .delete(agents)
        .where(
          and(
            eq(agents.agencyId, agencyId),
            isNull(agents.userId),
            notExists(tx.select({ id: calendarConnections.id }).from(calendarConnections).where(eq(calendarConnections.agentId, agents.id))),
          ),
        );
      await tx.delete(offices).where(eq(offices.agencyId, agencyId));
      await tx.delete(events).where(eq(events.agencyId, agencyId));
      // Without the website address the nightly run doesn't import the site again over the demo.
      await tx.update(agencySettings).set({ websiteUrl: null, websiteSync: {} }).where(eq(agencySettings.agencyId, agencyId));
    });
    const seeded = await seedDemoData.run(ctx, {});
    await recordEvent(ctx, { type: "demo.reset", subjectType: "agency", subjectId: agencyId, data: {} });
    return seeded;
  },
});
