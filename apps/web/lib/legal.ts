/**
 * Our company, as it appears in the data processing agreement agencies accept when they create
 * their workspace. While a field is empty the DPA page shows a blank and the join page asks for
 * no acceptance (an agreement with blanks can't be accepted).
 */
export const provider = {
  name: "",
  address: "",
  companyNumber: "",
  /** The city whose courts have jurisdiction (DPA clause 12). */
  courts: "",
};

/** Change the version whenever the DPA text changes: acceptances are stored with it. */
export const DPA_VERSION = "2026-11-23";
export const DPA_PATH = "/legal/dpa";

export const providerComplete = () => Boolean(provider.name && provider.address && provider.companyNumber && provider.courts);

/** The DPA to accept at /join: an outside DPA_URL if set, else our own page once our details are filled in. */
export function dpaTerms(): { url: string; version: string } | null {
  if (process.env.DPA_URL) return { url: process.env.DPA_URL, version: process.env.DPA_VERSION || DPA_VERSION };
  return providerComplete() ? { url: DPA_PATH, version: DPA_VERSION } : null;
}
