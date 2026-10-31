import { statusFrom, type ExtractedListing } from "./extract";

/*
 * Sites built with Gatsby (Omnicasa's "trung" sites among them) send a page without its content and fill it in with
 * scripts from a data file next to it: /page-data/<path>/page-data.json. Reading that file gives the listing's facts
 * without a browser. Pure: the caller reads the file.
 */

/** The data file of a Gatsby page, when the page is one. */
export function pageDataUrl(html: string, pageUrl: string): string | null {
  if (!/id=["']___gatsby["']|\/page-data\/|<meta[^>]+name=["']generator["'][^>]+content=["'](?:trung|gatsby)/i.test(html)) return null;
  const u = new URL(pageUrl);
  const path = u.pathname.replace(/\/+$/, "") || "/index";
  return `${u.origin}/page-data${path === "/" ? "/index" : path}/page-data.json`;
}

type Property = Record<string, unknown>;

/** The listing in a page's data file: the object that carries the property's own fields (Omnicasa's names). */
function findProperty(value: unknown, id: string | null, depth = 0): Property | null {
  if (!value || typeof value !== "object" || depth > 14) return null;
  if (!Array.isArray(value)) {
    const o = value as Property;
    if ("ID" in o && ("Price" in o || "ManagerName" in o) && ("Zip" in o || "City" in o) && (id == null || String(o.ID) === id)) return o;
  }
  for (const child of Object.values(value)) {
    const found = findProperty(child, id, depth + 1);
    if (found) return found;
  }
  return null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : typeof v === "string" && /^\d+(?:[.,]\d+)?$/.test(v.trim()) ? Number(v.replace(",", ".")) || null : null);
const titleCase = (s: string | null) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : s);

/** The facts a page's data file gives, as far as it gives them; null when it holds no listing. */
export function listingFromPageData(json: string, pageUrl: string): Partial<ExtractedListing> | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  // The listing whose number ends the page's address ("/kopen/deurne/appartement/5626"), not others shown next to it.
  const context = (data as { result?: { pageContext?: unknown } })?.result?.pageContext ?? data;
  const id = new URL(pageUrl).pathname.match(/\/(\d{2,9})\/?$/)?.[1] ?? null;
  const p = findProperty(context, id) ?? (id ? null : findProperty(context, null));
  if (!p) return null;
  return propertyFacts(p);
}

/**
 * The status the site shows: its label ("Optie", "Verkocht"; "Nieuw" or "Actief" say nothing about it), else the
 * status number. 1 is on offer; offices number the others differently (Immofrance's "Optie" is 3, Canius gives 2 to
 * both its "OPTIE" and "VERKOCHT" listings without a label in the data), so any other number counts as under option:
 * kept in the list, no bookings.
 */
function omnicasaStatus(p: Property): ExtractedListing["status"] {
  const label = statusFrom(text(p.SubStatusName), text(p.MarqueeName));
  if (label && label !== "active") return label;
  return typeof p.SubStatus === "number" && p.SubStatus > 1 ? "under_offer" : null;
}

/** An Omnicasa property object as listing facts. */
function propertyFacts(p: Property): Partial<ExtractedListing> {
  const photos = [p.LargePictures, p.XLargePictures, p.SmallPictures].find((v): v is string[] => Array.isArray(v) && v.length > 0) ?? [];
  const phone = text(p.ManagerMobilePhone) ?? text(p.ManagerDirectPhone);
  return {
    reference: p.ID != null ? String(p.ID) : null,
    transaction: p.Goal === 0 ? "sale" : p.Goal === 1 ? "rent" : null,
    status: omnicasaStatus(p),
    street: text(p.Street),
    houseNumber: text(p.HouseNumber),
    postcode: text(p.Zip),
    city: titleCase(text(p.City)),
    price: p.PublishPrice === false ? null : num(p.Price),
    bedrooms: typeof p.NumberOfBedRooms === "number" ? p.NumberOfBedRooms : null,
    bathrooms: typeof p.NumberOfBathRooms === "number" ? p.NumberOfBathRooms : null,
    livingArea: num(p.SurfaceLiving) ?? num(p.SurfaceTotal),
    plotArea: num(p.SurfaceGround2),
    epcScore: num(p.EnergyPerformance),
    photos,
    agentName: text(p.ManagerName),
    agentEmail: text(p.ManagerEmail)?.toLowerCase() ?? null,
    agentPhone: phone ? phone.replace(/[^\d+]/g, "").replace(/^0/, "+32") : null,
  };
}

/*
 * Next.js sites (Omnicasa's newer ones among them) send the page's data along in script calls,
 * self.__next_f.push([1,"…"]): the listing's own object, with the same fields, is in there.
 */
export function listingFromFlightData(html: string, pageUrl: string): Partial<ExtractedListing> | null {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)];
  if (!chunks.length) return null;
  let data = "";
  for (const chunk of chunks) {
    try {
      data += JSON.parse(chunk[1]!) as string;
    } catch {
      // A chunk JSON can't read: leave it out.
    }
  }
  const id = new URL(pageUrl).pathname.match(/\/(\d{2,9})\/?$/)?.[1] ?? null;
  if (!id || !data.includes('"ManagerName"')) return null;
  // The smallest object holding the listing's fields: walk the data once, keeping where each open object started.
  const starts: number[] = [];
  let inString = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") starts.push(i);
    else if (c === "}") {
      const start = starts.pop();
      if (start == null || i - start > 100_000) continue;
      const slice = data.slice(start, i + 1);
      if (!slice.includes('"ManagerName"') || !slice.includes(`"ID":${id}`)) continue;
      try {
        const p = findProperty(JSON.parse(slice), id);
        if (p) return propertyFacts(p);
      } catch {
        // Not a whole object on its own.
      }
    }
  }
  return null;
}

/**
 * Fields of the data file that say more than any word on the page: the site's own sale or rent, its label and the
 * listing's agent (the page's rules may take a line such as "Canius voor meer info" for a name).
 */
const SITE_FIELDS: (keyof ExtractedListing)[] = ["transaction", "status", "agentName", "agentEmail", "agentPhone"];

/**
 * What the page shows filled in with what its data file gives, the page's own reading first, except for the site
 * fields above: the page of a script-built site holds only its menu ("Kopen", "Huren"), not the listing's label.
 */
export function withPageData(listing: ExtractedListing, data: Partial<ExtractedListing>): ExtractedListing {
  const merged = { ...listing };
  for (const [key, value] of Object.entries(data) as [keyof ExtractedListing, ExtractedListing[keyof ExtractedListing]][]) {
    const current = merged[key];
    if (value == null || (Array.isArray(value) && !value.length)) continue;
    if (current == null || (Array.isArray(current) && !current.length) || SITE_FIELDS.includes(key)) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}
