import { AGENCY_TIMEZONE } from "../time";

export type Lang = "nl" | "fr" | "en";

const locales: Record<Lang, string> = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" };

export function toLang(value: string | null | undefined): Lang {
  return value === "fr" || value === "en" ? value : "nl";
}

/** "di 3 nov. om 10:00" / "mar. 3 nov. à 10:00" / "Tue 3 Nov at 10:00" */
export function formatSlot(date: Date, lang: Lang) {
  const day = new Intl.DateTimeFormat(locales[lang], { timeZone: AGENCY_TIMEZONE, weekday: "short", day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day} ${{ nl: "om", fr: "à", en: "at" }[lang]} ${time}`;
}

/** Appends the offered times, the link and the signature the same way for AI and template drafts. */
export function composeMessage(options: {
  lang: Lang;
  body: string;
  slots?: Date[];
  link?: { url: string; label: string };
  signature: string;
}) {
  const parts = [options.body.trim()];
  if (options.slots?.length) {
    parts.push(options.slots.map((slot) => `• ${formatSlot(slot, options.lang)}`).join("\n"));
  }
  if (options.link) parts.push(`${options.link.label}: ${options.link.url}`);
  parts.push(options.signature);
  return parts.join("\n\n");
}

export const linkLabels = {
  book: { nl: "Kies zelf een moment", fr: "Choisissez votre moment", en: "Pick a time yourself" },
  change: { nl: "Uw bezoek verplaatsen", fr: "Modifier votre visite", en: "Change your viewing" },
} satisfies Record<string, Record<Lang, string>>;

export function signature(lang: Lang, agentName: string, agencyName: string, channel: string = "email") {
  // WhatsApp gets a short sign-off; email the usual closing.
  if (channel !== "email") return `– ${agentName.split(" ")[0]}, ${agencyName}`;
  return { nl: `Met vriendelijke groeten,\n${agentName}\n${agencyName}`, fr: `Bien cordialement,\n${agentName}\n${agencyName}`, en: `Kind regards,\n${agentName}\n${agencyName}` }[lang];
}

type Vars = { name: string; address: string; agentName: string; other?: string };

/** Fallback drafts when Claude is not configured. The AI writes these itself when it is. */
export const templates: Record<string, Record<Lang, (v: Vars) => string>> = {
  viewing_request: {
    nl: (v) => `Beste ${v.name},\n\nBedankt voor uw interesse in ${v.address}. Het pand is nog beschikbaar en we laten het u graag zien. Deze momenten zijn nog vrij:`,
    fr: (v) => `Bonjour ${v.name},\n\nMerci pour votre intérêt pour ${v.address}. Le bien est toujours disponible et nous serons ravis de vous le faire visiter. Voici les moments encore libres :`,
    en: (v) => `Dear ${v.name},\n\nThank you for your interest in ${v.address}. It is still available and we would be happy to show you around. These times are still free:`,
  },
  reschedule: {
    nl: (v) => `Beste ${v.name},\n\nGeen probleem, we verplaatsen uw bezoek aan ${v.address} graag. Past een van deze momenten?`,
    fr: (v) => `Bonjour ${v.name},\n\nAucun souci, nous déplaçons volontiers votre visite de ${v.address}. L'un de ces moments vous convient-il ?`,
    en: (v) => `Dear ${v.name},\n\nNo problem, we're happy to move your viewing at ${v.address}. Would one of these times suit you?`,
  },
  cancellation: {
    nl: (v) => `Beste ${v.name},\n\nBedankt om ons te verwittigen. We hebben uw bezoek aan ${v.address} geannuleerd. Wilt u later toch nog komen kijken? Deze momenten zijn vrij:`,
    fr: (v) => `Bonjour ${v.name},\n\nMerci de nous avoir prévenus. Nous avons annulé votre visite de ${v.address}. Si vous souhaitez tout de même venir plus tard, voici les moments disponibles :`,
    en: (v) => `Dear ${v.name},\n\nThanks for letting us know. We've cancelled your viewing at ${v.address}. If you'd still like to come later, these times are free:`,
  },
  cancelled_by_client: {
    nl: (v) => `Beste ${v.name},\n\nWe zagen dat u uw bezoek aan ${v.address} heeft geannuleerd, geen probleem. Wilt u toch nog komen kijken? Deze momenten zijn vrij:`,
    fr: (v) => `Bonjour ${v.name},\n\nNous avons bien vu que vous avez annulé votre visite de ${v.address}, aucun souci. Souhaitez-vous venir à un autre moment ? Voici les moments disponibles :`,
    en: (v) => `Dear ${v.name},\n\nWe saw you cancelled your viewing at ${v.address}, no problem at all. Would you like to come at another time? These times are free:`,
  },
  question: {
    nl: (v) => `Beste ${v.name},\n\nBedankt voor uw vraag over ${v.address}. ${v.agentName} bekijkt dit en komt vandaag nog bij u terug.`,
    fr: (v) => `Bonjour ${v.name},\n\nMerci pour votre question concernant ${v.address}. ${v.agentName} examine cela et revient vers vous aujourd'hui.`,
    en: (v) => `Dear ${v.name},\n\nThank you for your question about ${v.address}. ${v.agentName} is looking into it and will get back to you today.`,
  },
  offer: {
    nl: (v) => `Beste ${v.name},\n\nWat fijn om te horen dat ${v.address} u zo bevalt! ${v.agentName} belt u graag om de volgende stappen en een eventueel bod rustig te overlopen. Wanneer past een telefoontje het best?`,
    fr: (v) => `Bonjour ${v.name},\n\nNous sommes ravis que ${v.address} vous plaise autant ! ${v.agentName} vous appellera volontiers pour parcourir ensemble les prochaines étapes et une éventuelle offre. Quand êtes-vous joignable ?`,
    en: (v) => `Dear ${v.name},\n\nGreat to hear you like ${v.address} so much! ${v.agentName} would be happy to call you to go through the next steps and a possible offer. When is a good time to call?`,
  },
  feedback_negative: {
    nl: (v) => `Beste ${v.name},\n\nBedankt voor uw eerlijke feedback over ${v.address}, dat helpt ons echt.${v.other ? ` Misschien is dit iets voor u: ${v.other}.` : ""} Zal ik u verwittigen wanneer er een pand binnenkomt dat beter past?`,
    fr: (v) => `Bonjour ${v.name},\n\nMerci pour votre retour sincère sur ${v.address}, cela nous aide vraiment.${v.other ? ` Ceci pourrait vous intéresser : ${v.other}.` : ""} Souhaitez-vous être prévenu(e) lorsqu'un bien plus adapté arrive ?`,
    en: (v) => `Dear ${v.name},\n\nThank you for your honest feedback on ${v.address}, it really helps.${v.other ? ` This might suit you: ${v.other}.` : ""} Shall I let you know when something that fits better comes in?`,
  },
  follow_up: {
    nl: (v) => `Beste ${v.name},\n\nBedankt voor uw bezoek aan ${v.address}. Hoe heeft u het ervaren? Als u nog vragen heeft, een tweede bezoek wilt of een bod overweegt, laat het gerust weten.`,
    fr: (v) => `Bonjour ${v.name},\n\nMerci pour votre visite de ${v.address}. Qu'en avez-vous pensé ? Si vous avez des questions, souhaitez une seconde visite ou envisagez une offre, n'hésitez pas à me le dire.`,
    en: (v) => `Dear ${v.name},\n\nThank you for viewing ${v.address}. How did you find it? If you have questions, would like a second viewing or are considering an offer, just let me know.`,
  },
};
