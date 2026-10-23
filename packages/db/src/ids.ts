import { randomBytes } from "node:crypto";

const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * Prefixed, time-sortable ids such as `lst_01jc9x...`. The prefix makes ids
 * readable in logs and in agent tool calls; the time part keeps inserts ordered.
 */
export function newId(prefix: string): string {
  let time = Date.now();
  let timePart = "";
  for (let i = 0; i < 10; i++) {
    timePart = alphabet[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(12);
  let randomPart = "";
  for (const byte of bytes) randomPart += alphabet[byte % 32];
  return `${prefix}_${timePart}${randomPart}`;
}
