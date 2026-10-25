/**
 * A phone number as digits in international format without "+", the form
 * WhatsApp uses. Belgian national numbers ("0470 12 34 56") get the 32 prefix.
 */
export function normalizePhone(phone: string, defaultCountry = "32"): string {
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) digits = defaultCountry + digits.slice(1);
  return digits;
}

/** True when two numbers written differently are the same line. */
export function samePhone(a: string | null | undefined, b: string | null | undefined) {
  return Boolean(a && b && normalizePhone(a) === normalizePhone(b));
}
