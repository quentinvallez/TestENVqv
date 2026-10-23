import { eq, schema, sql } from "@viewing/db";
import { z } from "zod";
import { zonedDay, zonedTime } from "../time";
import { defineTool } from "../tool";

const { offices, agents, availabilityRules, listings, contacts, leads, appointments, events, proposals, conversations, messages } = schema;

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

    return ctx.db.transaction(async (tx) => {
      const [antwerp, ghent] = await tx
        .insert(offices)
        .values([
          { agencyId, name: "Antwerpen", street: "Meir 24", postcode: "2000", city: "Antwerpen", phone: "+32 3 123 45 67" },
          { agencyId, name: "Gent", street: "Veldstraat 61", postcode: "9000", city: "Gent", phone: "+32 9 123 45 67" },
        ])
        .returning();

      const agentRows = await tx
        .insert(agents)
        .values([
          { agencyId, officeId: antwerp!.id, name: "Sofie Peeters", email: "sofie@demo-agency.be", phone: "+32 470 11 22 33", color: "#6366f1", languages: ["nl", "en"] },
          { agencyId, officeId: antwerp!.id, name: "Thomas Janssens", email: "thomas@demo-agency.be", phone: "+32 471 22 33 44", color: "#10b981", languages: ["nl", "fr"] },
          { agencyId, officeId: ghent!.id, name: "Lien De Smet", email: "lien@demo-agency.be", phone: "+32 472 33 44 55", color: "#f59e0b", languages: ["nl", "en"] },
          { agencyId, officeId: ghent!.id, name: "Maxime Dubois", email: "maxime@demo-agency.be", phone: "+32 473 44 55 66", color: "#ec4899", languages: ["fr", "nl"] },
        ])
        .returning();
      const [sofie, thomas, lien, maxime] = agentRows;

      await tx.insert(availabilityRules).values(
        agentRows.flatMap((agent) =>
          [1, 2, 3, 4, 5].map((weekday) => ({ agencyId, agentId: agent.id, weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
        ),
      );

      const listingRows = await tx
        .insert(listings)
        .values([
          { agencyId, officeId: antwerp!.id, agentId: sofie!.id, reference: "ANT-1042", status: "active", transaction: "sale", propertyType: "apartment", title: "Lichtrijk appartement met terras", street: "Cogels-Osylei", houseNumber: "38", postcode: "2600", city: "Berchem", price: 395000, bedrooms: 2, bathrooms: 1, livingArea: 98, epcScore: 142, epcLabel: "B", photos: [{ url: photo("1502672260266-1c1ef2d93688") }], portalRefs: { immoweb: "21004871" } },
          { agencyId, officeId: antwerp!.id, agentId: sofie!.id, reference: "ANT-1043", status: "active", transaction: "sale", propertyType: "house", title: "Gerenoveerde burgerwoning met tuin", street: "Grote Steenweg", houseNumber: "112", postcode: "2600", city: "Berchem", price: 549000, bedrooms: 4, bathrooms: 2, livingArea: 186, plotArea: 210, epcScore: 168, epcLabel: "B", photos: [{ url: photo("1568605114967-8130f3a36994") }], portalRefs: { immoweb: "21004872" } },
          { agencyId, officeId: antwerp!.id, agentId: thomas!.id, reference: "ANT-1051", status: "active", transaction: "rent", propertyType: "apartment", title: "Penthouse aan het Eilandje", street: "Londenstraat", houseNumber: "7", postcode: "2000", city: "Antwerpen", price: 1650, bedrooms: 2, bathrooms: 2, livingArea: 120, epcScore: 64, epcLabel: "A", photos: [{ url: photo("1545324418-cc1a3fa10c00") }], portalRefs: { immoweb: "21004890" } },
          { agencyId, officeId: antwerp!.id, agentId: thomas!.id, reference: "ANT-1055", status: "under_offer", transaction: "sale", propertyType: "villa", title: "Moderne villa in het groen", street: "Kapellensteenweg", houseNumber: "301", postcode: "2930", city: "Brasschaat", price: 975000, bedrooms: 5, bathrooms: 3, livingArea: 320, plotArea: 1850, epcScore: 88, epcLabel: "A", photos: [{ url: photo("1613490493576-7fde63acd811") }] },
          { agencyId, officeId: ghent!.id, agentId: lien!.id, reference: "GNT-2011", status: "active", transaction: "sale", propertyType: "house", title: "Karaktervolle herenwoning", street: "Coupure Links", houseNumber: "55", postcode: "9000", city: "Gent", price: 785000, bedrooms: 4, bathrooms: 2, livingArea: 240, plotArea: 160, epcScore: 245, epcLabel: "C", photos: [{ url: photo("1600596542815-ffad4c1539a9") }], portalRefs: { immoweb: "21005120" } },
          { agencyId, officeId: ghent!.id, agentId: lien!.id, reference: "GNT-2014", status: "active", transaction: "rent", propertyType: "apartment", title: "Studio vlakbij Gent-Sint-Pieters", street: "Kortrijksesteenweg", houseNumber: "210", postcode: "9000", city: "Gent", price: 795, bedrooms: 0, bathrooms: 1, livingArea: 38, epcScore: 190, epcLabel: "C", photos: [{ url: photo("1522708323590-d24dbb6b0267") }] },
          { agencyId, officeId: ghent!.id, agentId: maxime!.id, reference: "GNT-2020", status: "active", transaction: "sale", propertyType: "house", title: "Halfopen bebouwing met grote tuin", street: "Hundelgemsesteenweg", houseNumber: "480", postcode: "9820", city: "Merelbeke", price: 435000, bedrooms: 3, bathrooms: 1, livingArea: 165, plotArea: 640, epcScore: 310, epcLabel: "D", photos: [{ url: photo("1570129477492-45c003edd2be") }], portalRefs: { immoweb: "21005177" } },
          { agencyId, officeId: ghent!.id, agentId: maxime!.id, reference: "GNT-2023", status: "draft", transaction: "sale", propertyType: "land", title: "Bouwgrond voor open bebouwing", street: "Pontstraat", houseNumber: "12", postcode: "9831", city: "Sint-Martens-Latem", price: 389000, plotArea: 1100, photos: [{ url: photo("1500382017468-9049fed747ef") }] },
          { agencyId, officeId: antwerp!.id, agentId: sofie!.id, reference: "ANT-0998", status: "sold", transaction: "sale", propertyType: "apartment", title: "Appartement aan het Zuid", street: "Vlaamsekaai", houseNumber: "16", postcode: "2000", city: "Antwerpen", price: 425000, bedrooms: 2, bathrooms: 1, livingArea: 104, epcScore: 120, epcLabel: "B", photos: [{ url: photo("1493809842364-78817add7ffb") }] },
        ])
        .returning();
      const byRef = Object.fromEntries(listingRows.map((l) => [l.reference, l]));

      const people: [string, string, string, "nl" | "fr" | "en"][] = [
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
      const leadPlan: [number, string, Stage, "immoweb" | "zimmo" | "website", string][] = [
        [0, "ANT-1042", "new", "immoweb", "Is het appartement nog beschikbaar? Graag een bezoek."],
        [1, "ANT-1043", "new", "immoweb", "Wij zijn geïnteresseerd en willen graag komen kijken."],
        [2, "GNT-2011", "new", "zimmo", "Bonjour, je souhaiterais visiter ce bien."],
        [3, "ANT-1051", "invited", "immoweb", "Vanaf wanneer is het penthouse beschikbaar?"],
        [4, "GNT-2020", "invited", "website", "Graag meer info over de tuin en de EPC."],
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
      const appointmentPlan: [number, number, number, number, "scheduled" | "confirmed" | "completed"][] = [
        [5, 0, 10, 0, "confirmed"],
        [6, 0, 14, 30, "confirmed"],
        [7, 1, 17, 30, "scheduled"],
        [5, 2, 11, 0, "scheduled"],
        [8, -2, 15, 0, "completed"],
        [11, -1, 10, 30, "completed"],
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
            };
          }),
        )
        .returning();

      // A WhatsApp reply the planner agent has interpreted as a cancellation.
      const cancelling = appointmentRows[2]!;
      const [conversation] = await tx
        .insert(conversations)
        .values({ agencyId, contactId: cancelling.contactId, leadId: cancelling.leadId, channel: "whatsapp", lastMessageAt: new Date() })
        .returning();
      await tx.insert(messages).values([
        { agencyId, conversationId: conversation!.id, direction: "outbound", body: "Hallo Louis, uw bezoek aan Grote Steenweg 112 is bevestigd. Tot dan!", sentAt: new Date(Date.now() - 26 * 3600 * 1000) },
        { agencyId, conversationId: conversation!.id, direction: "inbound", body: "Sorry, ik kan toch niet komen. Kan het volgende week?", intent: "reschedule" },
      ]);
      await tx.insert(proposals).values({
        agencyId,
        agentName: "planner",
        toolName: "appointments_reschedule",
        input: { appointmentId: cancelling.id, offerSlots: 3 },
        summary: "Louis Willems can't make his viewing at Grote Steenweg 112. Free the slot and send him 3 new times next week?",
        reasoning: 'WhatsApp reply: "Sorry, ik kan toch niet komen. Kan het volgende week?" Intent classified as reschedule.',
        subjectType: "appointment",
        subjectId: cancelling.id,
      });

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
        {
          agencyId,
          type: "message.received",
          subjectType: "conversation",
          subjectId: conversation!.id,
          actorType: "contact" as const,
          data: { channel: "whatsapp", intent: "reschedule" },
        },
      ]);

      return { seeded: true, listings: listingRows.length, leads: leadRows.length, appointments: appointmentRows.length };
    });
  },
});
