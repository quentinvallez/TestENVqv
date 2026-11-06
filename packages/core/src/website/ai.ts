import { z } from "zod";
import { generateStructured } from "../ai/client";
import type { ExtractedListing } from "./extract";
import type { FetchedImage } from "./fetch";
import type { CardBadge } from "./overview";

const schema = z.object({
  isListing: z.boolean().describe("True only if this page presents one single property (not an overview, article or project list)."),
  reference: z.string().nullable().describe("The agency's reference for the property, as shown on the page"),
  transaction: z.enum(["sale", "rent"]).nullable(),
  status: z.enum(["active", "under_offer", "sold", "rented"]).nullable().describe("For sale or rent = active; option/compromis = under_offer"),
  propertyType: z.enum(["house", "apartment", "villa", "land", "commercial", "office", "garage", "other"]).nullable(),
  title: z.string().nullable(),
  street: z.string().nullable().describe("Street name only, without number"),
  houseNumber: z.string().nullable(),
  postcode: z.string().nullable().describe("Belgian four-digit postcode"),
  city: z.string().nullable(),
  price: z.number().int().nullable().describe("Asking price in euros as printed on the page (monthly rent for rentals); null if not printed"),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  livingArea: z.number().int().nullable().describe("m²"),
  plotArea: z.number().int().nullable().describe("m² (1 are = 100 m²)"),
  epcScore: z.number().int().nullable().describe("kWh/m² per year"),
  epcLabel: z.string().nullable().describe("A+ to G"),
  agentName: z.string().nullable().describe("Full name of the agent or contact person for this property, if a person is named"),
  agentEmail: z.string().nullable().describe("That person's own email address, if shown (not the office's general address)"),
  agentPhone: z.string().nullable().describe("That person's phone number, if shown"),
});

const system = `You read one page of a Belgian real estate agency's website and copy the property facts it shows into fields.
Copy only what the page states; never estimate or invent a value, and use null when a fact isn't on the page.
The page text may be Dutch, French or English. Ignore menus, footers and lists of other properties.`;

/** Claude reads the page when the rules missed key facts. Throws when Claude isn't available. */
export async function extractWithAi(url: string, text: string): Promise<{ isListing: boolean; listing: Omit<ExtractedListing, "photos" | "description"> }> {
  const { isListing, ...listing } = await generateStructured({
    system,
    prompt: `Page address: ${url}\n\nPage text:\n${text.slice(0, 14000)}`,
    schema,
    effort: "low",
  });
  return { isListing, listing };
}

/** Rules win for the numbers they read from labels; Claude fills the gaps and judges type, status and contact person. */
export function mergeExtraction(rules: ExtractedListing, ai: Omit<ExtractedListing, "photos" | "description">): ExtractedListing {
  const merged: ExtractedListing = { ...rules };
  for (const [key, value] of Object.entries(ai) as [keyof typeof ai, unknown][]) {
    if (value == null) continue;
    const preferAi = key === "propertyType" || key === "status" || key === "transaction" || key === "agentName";
    if (preferAi || merged[key] == null) (merged as Record<string, unknown>)[key] = value;
  }
  if (merged.agentPhone) merged.agentPhone = merged.agentPhone.replace(/[^\d+]/g, "").replace(/^0/, "+32") || null;
  if (merged.agentEmail && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(merged.agentEmail)) merged.agentEmail = null;
  if (merged.postcode && !/^[1-9]\d{3}$/.test(merged.postcode)) merged.postcode = merged.postcode.match(/[1-9]\d{3}/)?.[0] ?? null;
  return merged;
}

const badgeSchema = z.object({
  status: z
    .enum(["sold", "rented", "under_offer", "none"])
    .describe("sold: the picture says sold (vendu, verkocht); rented: rented (loué, verhuurd); under_offer: option, compromis, reserved (optie, sous option); none: anything else or no status word"),
});

/**
 * Claude reads a picture an agency lays over the photos of some listing cards (a sticker "VENDU!" held by an agent),
 * to tell which status it shows. Called once per picture and site. Throws when Claude isn't available.
 */
export async function badgeFromImage(url: string, image: FetchedImage): Promise<CardBadge | "none"> {
  const { status } = await generateStructured({
    system: `You look at one picture from a Belgian real estate agency's website. The agency lays it over the photos of some listings on its overview pages.
Say which listing status the picture's text shows. Only a status written in the picture counts; "none" when it shows another word (new, price drop) or no word.`,
    prompt: [
      { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
      { type: "text", text: `Picture address: ${url}` },
    ],
    schema: badgeSchema,
    effort: "low",
  });
  return status;
}
