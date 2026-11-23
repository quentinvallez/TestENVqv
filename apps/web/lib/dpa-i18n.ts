/**
 * The data processing agreement in English, Dutch and French (lib/legal.ts holds our company
 * details and the version). Change the text in all three languages and bump DPA_VERSION.
 */

export type DpaLang = "en" | "nl" | "fr";
export const dpaLangs: DpaLang[] = ["nl", "fr", "en"];

export const toDpaLang = (value: string | null | undefined): DpaLang => {
  const v = value?.slice(0, 2).toLowerCase();
  return v === "nl" || v === "fr" ? v : "en";
};

type Party = { name: string; address: string; companyNumber: string; courts: string };
type Rows = string[][];

export type DpaText = {
  title: string;
  version: (v: string) => string;
  languages: string;
  parties: (p: Party) => string;
  clauses: [string, string][];
  /** Clause 12, which names the courts. */
  liability: (courts: string) => [string, string];
  /** Clause 13. */
  agencyDuties: [string, string];
  acceptance: string;
  prevails: string;
  annex1: { title: string; head: string[]; rows: Rows };
  annex2: { title: string; intro: string; head: string[]; rows: Rows; note: string };
  annex3: { title: string; head: string[]; rows: Rows };
};

const blanks = {
  en: { name: "company name", address: "address", number: "company number", city: "city" },
  nl: { name: "bedrijfsnaam", address: "adres", number: "ondernemingsnummer", city: "stad" },
  fr: { name: "nom de la société", address: "adresse", number: "numéro d'entreprise", city: "ville" },
};
const blank = (lang: DpaLang, value: string, key: keyof (typeof blanks)["en"]) => value || `[${blanks[lang][key]}]`;

export const dpaText: Record<DpaLang, DpaText> = {
  en: {
    title: "Data processing agreement",
    version: (v) => `Version ${v}`,
    languages: "Language",
    parties: (p) =>
      `Between the real estate agency that accepts this agreement when it creates its Unbird workspace, the controller ("the Agency"), and ${blank("en", p.name, "name")}, ${blank("en", p.address, "address")}, company number ${blank("en", p.companyNumber, "number")}, which provides Unbird, the processor ("the Provider").`,
    clauses: [
      [
        "Subject",
        "The Provider processes personal data for the Agency only to provide the viewing planner: booking widget, viewing requests, reminders and follow-ups, valuations and the related messages, as described in Annex 1. This agreement is part of the subscription contract and lasts as long as it does, and in any case for as long as the Provider still holds the Agency's personal data. On data protection, this agreement prevails over the subscription contract.",
      ],
      [
        "Instructions",
        "The Provider processes the data only on the Agency's documented instructions, which are this agreement and the settings the Agency chooses in the app. If an instruction seems to break data protection law, the Provider tells the Agency straight away. If EU or Belgian law obliges the Provider to process the data in another way, it tells the Agency before doing so, unless that law forbids it. These instructions include transfers outside the EEA (clause 6).",
      ],
      ["Confidentiality", "Everyone at the Provider with access to the data is bound to confidentiality and gets access only when their task needs it."],
      ["Security", "The Provider takes the measures in Annex 3 and keeps them up to date with the state of the art."],
      [
        "Subprocessors",
        "The Agency gives general authorisation for the subprocessors in Annex 2. The Provider announces a new or replaced subprocessor at least 30 days in advance by email; the Agency may object on reasonable grounds and, if no solution is found, end the subscription without cost. The Provider imposes the same data protection obligations on each subprocessor by written contract and stays fully liable to the Agency for them. The current list is Annex 2 on this page.",
      ],
      [
        "Transfers outside the EEA",
        "Data is hosted in the EU. A transfer outside the EEA happens only where Annex 2 says so, under an adequacy decision (including the EU-US Data Privacy Framework, where the recipient is certified) or else the EU standard contractual clauses (module 3, processor to subprocessor) with a transfer impact assessment that the Provider shares on request. If an adequacy decision falls away, the Provider relies on the standard contractual clauses or stops the transfer.",
      ],
      [
        "Rights of data subjects",
        "The app lets the Agency export and erase a client's data itself. The Provider helps with any other request within 5 working days and forwards requests it receives directly to the Agency within 2 working days, without answering them beyond telling the person that their request was passed on.",
      ],
      [
        "Breaches",
        "The Provider informs the Agency without undue delay and at the latest within 48 hours of becoming aware of a personal data breach, with what is known: nature, data and people concerned, likely consequences and measures taken. What is not yet known follows in phases as soon as it is. The Provider keeps the Agency informed of its investigation, documents every breach, and does not notify the authority or the people concerned itself unless the Agency asks it to. The Agency decides on notifying the Data Protection Authority (GBA/APD, within 72 hours) and the people concerned.",
      ],
      [
        "Assistance",
        "The Provider helps the Agency meet its obligations on security, breach notification, data protection impact assessments and prior consultations (art. 32 to 36 GDPR), as far as they concern the app.",
      ],
      [
        "End of the contract",
        "Within 30 days after the end the Provider deletes all the Agency's personal data, including copies, unless EU or Belgian law requires it to keep them; before deleting, it offers the Agency an export. Backups expire within 30 days. The Provider confirms the deletion in writing.",
      ],
      [
        "Audits",
        "The Provider makes available all information needed to show compliance, answers a security questionnaire once a year, and allows an audit by the Agency or an independent auditor with 30 days' notice, at the Agency's cost. Audits take place at most once a year unless there was a breach or an authority demands it, during office hours, under confidentiality, and never give access to other agencies' data. If an audit shows that the Provider breached this agreement, the Provider bears its cost.",
      ],
    ],
    liability: (courts) => [
      "Liability and law",
      `Between the parties, liability is limited to the fees the Agency paid in the 12 months before the event, except for intent, gross negligence, and fines or damages caused by the Provider acting outside the Agency's instructions or breaching this agreement. Nothing limits the rights of the people concerned under art. 82 GDPR. Belgian law applies; the courts of ${blank("en", courts, "city")} have jurisdiction.`,
    ],
    agencyDuties: [
      "The Agency's responsibilities",
      "The Agency is responsible for the lawfulness of the processing: a legal basis for each purpose, informing its clients (the app provides a privacy notice it can use), the settings it chooses, and not entering special categories of data in notes or messages. It gives instructions through the app's settings or in writing.",
    ],
    acceptance:
      "The Agency accepts this agreement electronically when it creates its workspace. The Provider keeps the date and time, the login that accepted it and the version.",
    prevails: "This agreement exists in English, Dutch and French. If the versions differ, the English version prevails.",
    annex1: {
      title: "Annex 1: the processing",
      head: ["What", "Details"],
      rows: [
        ["People concerned", "Prospective buyers and tenants, owners asking for a valuation, owners and tenants of listed homes, the Agency's own staff (logins)"],
        [
          "Data",
          "Name, email, phone, language, WhatsApp opt-in; viewings and valuation visits; answers to the booking questions the Agency sets (by default: own use or investment, whether financing is arranged, whether they must sell first, timing, move-in date, household size, pets); messages exchanged by email and WhatsApp; portal and website lead emails, forwarded to the app or read from a connected Outlook mailbox; for valuations, the home's address and features; when owners and tenants can receive visitors; for staff, name, email, role, connected mailbox and calendar tokens (encrypted) and login sessions (IP address, browser); staff names and contact details read from the Agency's website",
        ],
        [
          "No special categories",
          "The app asks for no health, religion or origin data; it asks whether financing is arranged, which is financial information but not a special category; free-text messages may contain what a client writes themselves",
        ],
        [
          "Purposes",
          "Plan, confirm, remind, move and cancel viewings; answer and follow up clients; draft replies for staff approval; estimate a home's value; alert owners and tenants about visits",
        ],
        [
          "Automated steps",
          'Triage and draft replies by AI, always reviewed by staff before sending; fixed-text replies, confirmations and reminders sent automatically unless the Agency chooses "Ask me first"; no decisions with legal effect on a person',
        ],
        [
          "Retention",
          "Until the Agency erases the client, or automatically after 24 months without contact (setting: 12, 24, 36, 60 months or never); clients with an offer or a deal and owners and tenants of a listing are kept; unconfirmed valuation forms after 30 days; all data within 30 days after the contract ends",
        ],
        ["Where", "EU hosting (Frankfurt), except the transfers listed in Annex 2"],
      ],
    },
    annex2: {
      title: "Annex 2: subprocessors",
      intro:
        "The app and its database run in Frankfurt. Message content leaves the EU in two places: the AI service and WhatsApp (Meta). Both are named in the privacy notice for clients.",
      head: ["Subprocessor", "What it does", "Data", "Location", "Transfer basis"],
      rows: [
        ["Vercel Inc.", "Hosting of the app (region fra1)", "All, while processed", "Frankfurt, Germany", "US company: EU-US Data Privacy Framework + SCCs (Vercel DPA)"],
        ["Neon (Databricks)", "Database (region eu-central-1)", "All, stored", "Frankfurt, Germany", "US company: DPF + SCCs (Neon DPA)"],
        [
          "Mailgun (Sinch)",
          "Sending and receiving email from the agency address, EU region",
          "Email addresses and content, including forwarded portal leads; delivery logs",
          "EU",
          "DPF + SCCs for any support access",
        ],
        [
          "Anthropic PBC",
          "AI triage and reply drafts (Claude API)",
          "Client first and last name, the conversation (which may hold contact details the client writes), booking answers, agent and agency name, listing details",
          "United States",
          "SCCs in Anthropic's DPA; API data is not used to train models",
        ],
        [
          "Meta Platforms Ireland",
          "WhatsApp Business messages for clients who wrote first or opted in (including template confirmations and reminders), and the phone check for valuations",
          "Phone number, WhatsApp messages",
          "EU and United States",
          "Meta's WhatsApp Business terms + SCCs",
        ],
      ],
      note: "Not our subprocessors: the agents' own Microsoft 365 or Google mailbox and calendar. The Agency already contracts with them; the app sends mail and writes calendar events through them with the permissions the agent approves, and in a connected Outlook mailbox it only opens emails from the property portals and the Agency's own website.",
    },
    annex3: {
      title: "Annex 3: security measures",
      head: ["Area", "Measure in place"],
      rows: [
        ["Separation between agencies", "Every query is scoped to the agency; one agency can never read another's data"],
        [
          "Access",
          "Workspaces are created only after the Provider approves the agency; new logins only from a link emailed to that address; personal logins per agent; admins and agents have different rights; passwords of at least 8 characters, stored hashed; reset links valid 1 hour, once, and resetting logs out other sessions",
        ],
        ["Encryption", "HTTPS everywhere; database encrypted at rest; mailbox, calendar and WhatsApp tokens encrypted with a separate key"],
        [
          "Least data",
          "Mailboxes are used to send; in Outlook the app only opens emails from the property portals and the Agency's website, never other mail; owners and tenants see visitors as first name and initial only; sales comparables shown by street, never house number",
        ],
        ["Integrity", "Incoming webhooks (email, WhatsApp) are signature-checked; bookings are locked per agent to prevent double bookings"],
        ["Traceability", "An activity log of every change (who, what, when); erasures are logged without naming the person"],
        ["Availability", "Managed EU database with point-in-time restore; hosting with automatic failover"],
        ["Secrets", "Keys only in the hosting provider's encrypted settings, never in code"],
        ["People", "Access to production limited to the people who run the platform at the Provider; confidentiality in employment and contractor contracts"],
      ],
    },
  },

  nl: {
    title: "Verwerkersovereenkomst",
    version: (v) => `Versie ${v}`,
    languages: "Taal",
    parties: (p) =>
      `Tussen het vastgoedkantoor dat deze overeenkomst aanvaardt wanneer het zijn Unbird-werkruimte aanmaakt, de verwerkingsverantwoordelijke ("het Kantoor"), en ${blank("nl", p.name, "name")}, ${blank("nl", p.address, "address")}, ondernemingsnummer ${blank("nl", p.companyNumber, "number")}, dat Unbird levert, de verwerker ("de Leverancier").`,
    clauses: [
      [
        "Voorwerp",
        "De Leverancier verwerkt persoonsgegevens voor het Kantoor enkel om de bezoekplanner te leveren: boekingswidget, bezoekaanvragen, herinneringen en opvolging, schattingen en de bijbehorende berichten, zoals beschreven in Bijlage 1. Deze overeenkomst maakt deel uit van het abonnementscontract en loopt zolang dat contract loopt, en in elk geval zolang de Leverancier nog persoonsgegevens van het Kantoor bewaart. Voor gegevensbescherming heeft deze overeenkomst voorrang op het abonnementscontract.",
      ],
      [
        "Instructies",
        "De Leverancier verwerkt de gegevens enkel op gedocumenteerde instructies van het Kantoor: deze overeenkomst en de instellingen die het Kantoor in de app kiest. Lijkt een instructie in strijd met de wetgeving inzake gegevensbescherming, dan meldt de Leverancier dat onmiddellijk aan het Kantoor. Verplicht het Europese of Belgische recht de Leverancier om de gegevens anders te verwerken, dan meldt hij dat vooraf aan het Kantoor, tenzij die wet dat verbiedt. Deze instructies omvatten de doorgiften buiten de EER (artikel 6).",
      ],
      ["Vertrouwelijkheid", "Iedereen bij de Leverancier met toegang tot de gegevens is tot geheimhouding verplicht en krijgt enkel toegang wanneer zijn taak dat vereist."],
      ["Beveiliging", "De Leverancier neemt de maatregelen uit Bijlage 3 en houdt ze in lijn met de stand van de techniek."],
      [
        "Subverwerkers",
        "Het Kantoor geeft algemene toestemming voor de subverwerkers in Bijlage 2. De Leverancier kondigt een nieuwe of vervangende subverwerker minstens 30 dagen vooraf per e-mail aan; het Kantoor kan op redelijke gronden bezwaar maken en, als er geen oplossing komt, het abonnement kosteloos beëindigen. De Leverancier legt elke subverwerker bij schriftelijk contract dezelfde verplichtingen inzake gegevensbescherming op en blijft daarvoor volledig aansprakelijk tegenover het Kantoor. De actuele lijst is Bijlage 2 op deze pagina.",
      ],
      [
        "Doorgifte buiten de EER",
        "De gegevens worden in de EU gehost. Een doorgifte buiten de EER gebeurt enkel waar Bijlage 2 dat vermeldt, op basis van een adequaatheidsbesluit (waaronder het EU-VS Data Privacy Framework, als de ontvanger gecertificeerd is) of anders de modelcontractbepalingen van de EU (module 3, verwerker naar subverwerker) met een doorgiftebeoordeling die de Leverancier op verzoek bezorgt. Vervalt een adequaatheidsbesluit, dan steunt de Leverancier op de modelcontractbepalingen of stopt hij de doorgifte.",
      ],
      [
        "Rechten van betrokkenen",
        "Met de app kan het Kantoor zelf de gegevens van een klant exporteren en wissen. De Leverancier helpt bij elk ander verzoek binnen 5 werkdagen en stuurt verzoeken die hij rechtstreeks ontvangt binnen 2 werkdagen door naar het Kantoor, zonder ze verder te beantwoorden dan de persoon te laten weten dat het verzoek is doorgestuurd.",
      ],
      [
        "Inbreuken",
        "De Leverancier informeert het Kantoor zonder onredelijke vertraging en uiterlijk binnen 48 uur nadat hij kennis kreeg van een inbreuk in verband met persoonsgegevens, met wat bekend is: aard, betrokken gegevens en personen, waarschijnlijke gevolgen en genomen maatregelen. Wat nog niet bekend is, volgt in fasen zodra het bekend is. De Leverancier houdt het Kantoor op de hoogte van zijn onderzoek, documenteert elke inbreuk en meldt die niet zelf aan de toezichthouder of de betrokkenen, tenzij het Kantoor daarom vraagt. Het Kantoor beslist over de melding aan de Gegevensbeschermingsautoriteit (GBA, binnen 72 uur) en aan de betrokkenen.",
      ],
      [
        "Bijstand",
        "De Leverancier helpt het Kantoor zijn verplichtingen na te komen inzake beveiliging, melding van inbreuken, gegevensbeschermingseffectbeoordelingen en voorafgaande raadplegingen (art. 32 tot 36 AVG), voor zover ze de app betreffen.",
      ],
      [
        "Einde van het contract",
        "Binnen 30 dagen na het einde wist de Leverancier alle persoonsgegevens van het Kantoor, ook kopieën, tenzij het Europese of Belgische recht hem verplicht ze te bewaren; vóór het wissen biedt hij het Kantoor een export aan. Back-ups vervallen binnen 30 dagen. De Leverancier bevestigt het wissen schriftelijk.",
      ],
      [
        "Audits",
        "De Leverancier stelt alle informatie ter beschikking die nodig is om naleving aan te tonen, beantwoordt eenmaal per jaar een beveiligingsvragenlijst en staat een audit toe door het Kantoor of een onafhankelijke auditor, met 30 dagen voorafgaande kennisgeving en op kosten van het Kantoor. Audits vinden hoogstens eenmaal per jaar plaats, tenzij er een inbreuk was of een toezichthouder erom vraagt, tijdens de kantooruren, onder geheimhouding en zonder ooit toegang tot gegevens van andere kantoren. Blijkt uit een audit dat de Leverancier deze overeenkomst schond, dan draagt de Leverancier de kosten ervan.",
      ],
    ],
    liability: (courts) => [
      "Aansprakelijkheid en recht",
      `Tussen de partijen is de aansprakelijkheid beperkt tot de vergoedingen die het Kantoor betaalde in de 12 maanden vóór het voorval, behalve bij opzet, grove nalatigheid, en boetes of schade doordat de Leverancier buiten de instructies van het Kantoor handelde of deze overeenkomst schond. Niets beperkt de rechten van de betrokkenen onder art. 82 AVG. Het Belgische recht is van toepassing; de rechtbanken van ${blank("nl", courts, "city")} zijn bevoegd.`,
    ],
    agencyDuties: [
      "Verantwoordelijkheden van het Kantoor",
      "Het Kantoor is verantwoordelijk voor de rechtmatigheid van de verwerking: een rechtsgrond voor elk doeleinde, het informeren van zijn klanten (de app biedt een privacyverklaring die het kan gebruiken), de instellingen die het kiest, en geen bijzondere categorieën van gegevens invoeren in notities of berichten. Het geeft instructies via de instellingen van de app of schriftelijk.",
    ],
    acceptance:
      "Het Kantoor aanvaardt deze overeenkomst elektronisch wanneer het zijn werkruimte aanmaakt. De Leverancier bewaart de datum en het uur, de login die aanvaardde en de versie.",
    prevails: "Deze overeenkomst bestaat in het Engels, Nederlands en Frans. Bij verschil tussen de versies heeft de Engelse versie voorrang.",
    annex1: {
      title: "Bijlage 1: de verwerking",
      head: ["Wat", "Details"],
      rows: [
        ["Betrokkenen", "Kandidaat-kopers en -huurders, eigenaars die een schatting vragen, eigenaars en huurders van aangeboden woningen, het eigen personeel van het Kantoor (logins)"],
        [
          "Gegevens",
          "Naam, e-mail, telefoon, taal, WhatsApp-toestemming; bezoeken en schattingsbezoeken; antwoorden op de boekingsvragen die het Kantoor instelt (standaard: eigen gebruik of investering, of de financiering rond is, of ze eerst moeten verkopen, timing, gewenste intrekdatum, gezinsgrootte, huisdieren); berichten via e-mail en WhatsApp; leadmails van portalen en de website, doorgestuurd naar de app of gelezen uit een gekoppelde Outlook-mailbox; voor schattingen het adres en de kenmerken van de woning; wanneer eigenaars en huurders bezoekers kunnen ontvangen; voor personeel naam, e-mail, rol, tokens van gekoppelde mailbox en agenda (versleuteld) en loginsessies (IP-adres, browser); namen en contactgegevens van personeel gelezen van de website van het Kantoor",
        ],
        [
          "Geen bijzondere categorieën",
          "De app vraagt geen gegevens over gezondheid, religie of afkomst; ze vraagt wel of de financiering rond is, wat financiële informatie is maar geen bijzondere categorie; vrije berichten kunnen bevatten wat een klant zelf schrijft",
        ],
        [
          "Doeleinden",
          "Bezoeken plannen, bevestigen, herinneren, verplaatsen en annuleren; klanten antwoorden en opvolgen; antwoorden voorbereiden ter goedkeuring door het personeel; de waarde van een woning schatten; eigenaars en huurders verwittigen over bezoeken",
        ],
        [
          "Geautomatiseerde stappen",
          'Sortering en ontwerpantwoorden door AI, altijd nagelezen door het personeel vóór verzending; antwoorden, bevestigingen en herinneringen met vaste tekst automatisch verstuurd, tenzij het Kantoor "Eerst vragen" kiest; geen beslissingen met rechtsgevolgen voor een persoon',
        ],
        [
          "Bewaring",
          "Tot het Kantoor de klant wist, of automatisch na 24 maanden zonder contact (instelling: 12, 24, 36, 60 maanden of nooit); klanten met een bod of een deal en eigenaars en huurders van een pand blijven bewaard; onbevestigde schattingsformulieren na 30 dagen; alle gegevens binnen 30 dagen na het einde van het contract",
        ],
        ["Waar", "Hosting in de EU (Frankfurt), behalve de doorgiften in Bijlage 2"],
      ],
    },
    annex2: {
      title: "Bijlage 2: subverwerkers",
      intro:
        "De app en haar databank draaien in Frankfurt. De inhoud van berichten verlaat de EU op twee plaatsen: de AI-dienst en WhatsApp (Meta). Beide staan vermeld in de privacyverklaring voor klanten.",
      head: ["Subverwerker", "Wat hij doet", "Gegevens", "Locatie", "Grondslag doorgifte"],
      rows: [
        ["Vercel Inc.", "Hosting van de app (regio fra1)", "Alle, tijdens verwerking", "Frankfurt, Duitsland", "Amerikaans bedrijf: EU-VS Data Privacy Framework + modelcontractbepalingen (DPA van Vercel)"],
        ["Neon (Databricks)", "Databank (regio eu-central-1)", "Alle, opgeslagen", "Frankfurt, Duitsland", "Amerikaans bedrijf: DPF + modelcontractbepalingen (DPA van Neon)"],
        [
          "Mailgun (Sinch)",
          "E-mail versturen en ontvangen via het adres van het kantoor, EU-regio",
          "E-mailadressen en inhoud, ook doorgestuurde portaalleads; afleverlogs",
          "EU",
          "DPF + modelcontractbepalingen voor eventuele toegang door support",
        ],
        [
          "Anthropic PBC",
          "AI-sortering en ontwerpantwoorden (Claude API)",
          "Voor- en achternaam van de klant, het gesprek (dat contactgegevens kan bevatten die de klant schrijft), antwoorden op boekingsvragen, naam van makelaar en kantoor, gegevens van het pand",
          "Verenigde Staten",
          "Modelcontractbepalingen in de DPA van Anthropic; API-gegevens worden niet gebruikt om modellen te trainen",
        ],
        [
          "Meta Platforms Ireland",
          "WhatsApp Business-berichten voor klanten die eerst schreven of toestemming gaven (ook bevestigingen en herinneringen via sjablonen), en de telefooncontrole voor schattingen",
          "Telefoonnummer, WhatsApp-berichten",
          "EU en Verenigde Staten",
          "WhatsApp Business-voorwaarden van Meta + modelcontractbepalingen",
        ],
      ],
      note: "Geen subverwerkers van ons: de eigen Microsoft 365- of Google-mailbox en -agenda van de makelaars. Het Kantoor heeft daar al een contract mee; de app verstuurt e-mails en zet afspraken in de agenda via die diensten, met de rechten die de makelaar goedkeurt, en in een gekoppelde Outlook-mailbox opent ze enkel e-mails van de vastgoedportalen en van de eigen website van het Kantoor.",
    },
    annex3: {
      title: "Bijlage 3: beveiligingsmaatregelen",
      head: ["Domein", "Genomen maatregel"],
      rows: [
        ["Scheiding tussen kantoren", "Elke opvraging is beperkt tot het kantoor; een kantoor kan nooit gegevens van een ander kantoor lezen"],
        [
          "Toegang",
          "Werkruimtes worden enkel aangemaakt nadat de Leverancier het kantoor goedkeurt; nieuwe logins enkel via een link die naar dat adres werd gemaild; persoonlijke logins per makelaar; beheerders en makelaars hebben verschillende rechten; wachtwoorden van minstens 8 tekens, gehasht opgeslagen; resetlinks 1 uur en eenmalig geldig, en een reset logt de andere sessies uit",
        ],
        ["Versleuteling", "Overal HTTPS; databank versleuteld in rust; tokens van mailbox, agenda en WhatsApp versleuteld met een aparte sleutel"],
        [
          "Minimale gegevens",
          "Mailboxen dienen om te versturen; in Outlook opent de app enkel e-mails van de vastgoedportalen en de website van het Kantoor, nooit andere mail; eigenaars en huurders zien bezoekers enkel als voornaam en initiaal; vergelijkbare verkopen getoond per straat, nooit met huisnummer",
        ],
        ["Integriteit", "Inkomende webhooks (e-mail, WhatsApp) worden op handtekening gecontroleerd; boekingen worden per makelaar vergrendeld om dubbele boekingen te voorkomen"],
        ["Traceerbaarheid", "Een activiteitenlog van elke wijziging (wie, wat, wanneer); wissingen worden gelogd zonder de persoon te noemen"],
        ["Beschikbaarheid", "Beheerde databank in de EU met herstel naar een tijdstip; hosting met automatische failover"],
        ["Geheimen", "Sleutels enkel in de versleutelde instellingen van de hostingprovider, nooit in de code"],
        ["Mensen", "Toegang tot productie beperkt tot de mensen die het platform beheren bij de Leverancier; geheimhouding in arbeids- en aannemerscontracten"],
      ],
    },
  },

  fr: {
    title: "Contrat de sous-traitance",
    version: (v) => `Version ${v}`,
    languages: "Langue",
    parties: (p) =>
      `Entre l'agence immobilière qui accepte ce contrat lorsqu'elle crée son espace Unbird, le responsable du traitement (« l'Agence »), et ${blank("fr", p.name, "name")}, ${blank("fr", p.address, "address")}, numéro d'entreprise ${blank("fr", p.companyNumber, "number")}, qui fournit Unbird, le sous-traitant (« le Prestataire »).`,
    clauses: [
      [
        "Objet",
        "Le Prestataire traite des données personnelles pour l'Agence uniquement pour fournir le planning de visites : widget de réservation, demandes de visite, rappels et suivis, estimations et les messages qui s'y rapportent, comme décrit à l'Annexe 1. Ce contrat fait partie du contrat d'abonnement et dure aussi longtemps que celui-ci, et en tout cas aussi longtemps que le Prestataire détient encore des données personnelles de l'Agence. En matière de protection des données, ce contrat prime sur le contrat d'abonnement.",
      ],
      [
        "Instructions",
        "Le Prestataire traite les données uniquement sur instructions documentées de l'Agence : ce contrat et les réglages que l'Agence choisit dans l'application. Si une instruction semble enfreindre le droit de la protection des données, le Prestataire en informe immédiatement l'Agence. Si le droit européen ou belge oblige le Prestataire à traiter les données autrement, il en informe l'Agence au préalable, sauf si ce droit l'interdit. Ces instructions couvrent les transferts hors de l'EEE (article 6).",
      ],
      ["Confidentialité", "Toute personne chez le Prestataire ayant accès aux données est tenue à la confidentialité et n'y accède que lorsque sa tâche l'exige."],
      ["Sécurité", "Le Prestataire prend les mesures de l'Annexe 3 et les maintient à jour selon l'état de la technique."],
      [
        "Sous-traitants ultérieurs",
        "L'Agence donne une autorisation générale pour les sous-traitants ultérieurs de l'Annexe 2. Le Prestataire annonce un sous-traitant nouveau ou remplacé au moins 30 jours à l'avance par e-mail ; l'Agence peut s'y opposer pour des motifs raisonnables et, à défaut de solution, mettre fin à l'abonnement sans frais. Le Prestataire impose à chaque sous-traitant ultérieur, par contrat écrit, les mêmes obligations en matière de protection des données et reste pleinement responsable envers l'Agence. La liste à jour est l'Annexe 2 de cette page.",
      ],
      [
        "Transferts hors de l'EEE",
        "Les données sont hébergées dans l'UE. Un transfert hors de l'EEE n'a lieu que lorsque l'Annexe 2 le prévoit, sur la base d'une décision d'adéquation (y compris le cadre de protection des données UE-États-Unis, lorsque le destinataire est certifié) ou, à défaut, des clauses contractuelles types de l'UE (module 3, sous-traitant à sous-traitant) avec une évaluation de l'impact du transfert que le Prestataire communique sur demande. Si une décision d'adéquation disparaît, le Prestataire s'appuie sur les clauses contractuelles types ou arrête le transfert.",
      ],
      [
        "Droits des personnes concernées",
        "L'application permet à l'Agence d'exporter et d'effacer elle-même les données d'un client. Le Prestataire aide pour toute autre demande dans les 5 jours ouvrables et transmet à l'Agence, dans les 2 jours ouvrables, les demandes qu'il reçoit directement, sans y répondre au-delà d'informer la personne que sa demande a été transmise.",
      ],
      [
        "Violations",
        "Le Prestataire informe l'Agence dans les meilleurs délais et au plus tard dans les 48 heures après avoir pris connaissance d'une violation de données personnelles, avec ce qui est connu : nature, données et personnes concernées, conséquences probables et mesures prises. Ce qui n'est pas encore connu suit par étapes dès que possible. Le Prestataire tient l'Agence informée de son enquête, documente chaque violation et ne la notifie pas lui-même à l'autorité ou aux personnes concernées, sauf si l'Agence le lui demande. L'Agence décide de la notification à l'Autorité de protection des données (APD, dans les 72 heures) et aux personnes concernées.",
      ],
      [
        "Assistance",
        "Le Prestataire aide l'Agence à respecter ses obligations en matière de sécurité, de notification des violations, d'analyses d'impact relatives à la protection des données et de consultations préalables (art. 32 à 36 RGPD), dans la mesure où elles concernent l'application.",
      ],
      [
        "Fin du contrat",
        "Dans les 30 jours suivant la fin, le Prestataire supprime toutes les données personnelles de l'Agence, copies comprises, sauf si le droit européen ou belge l'oblige à les conserver ; avant la suppression, il propose un export à l'Agence. Les sauvegardes expirent dans les 30 jours. Le Prestataire confirme la suppression par écrit.",
      ],
      [
        "Audits",
        "Le Prestataire met à disposition toutes les informations nécessaires pour démontrer sa conformité, répond une fois par an à un questionnaire de sécurité et permet un audit par l'Agence ou un auditeur indépendant, moyennant un préavis de 30 jours et aux frais de l'Agence. Les audits ont lieu au maximum une fois par an, sauf en cas de violation ou à la demande d'une autorité, pendant les heures de bureau, sous confidentialité, et ne donnent jamais accès aux données d'autres agences. Si un audit révèle que le Prestataire a enfreint ce contrat, le Prestataire en supporte le coût.",
      ],
    ],
    liability: (courts) => [
      "Responsabilité et droit applicable",
      `Entre les parties, la responsabilité est limitée aux montants payés par l'Agence au cours des 12 mois précédant le fait, sauf en cas de dol, de faute grave, et d'amendes ou de dommages causés par le Prestataire agissant en dehors des instructions de l'Agence ou en violation de ce contrat. Rien ne limite les droits des personnes concernées en vertu de l'art. 82 RGPD. Le droit belge s'applique ; les tribunaux de ${blank("fr", courts, "city")} sont compétents.`,
    ],
    agencyDuties: [
      "Responsabilités de l'Agence",
      "L'Agence est responsable de la licéité du traitement : une base juridique pour chaque finalité, l'information de ses clients (l'application fournit une déclaration de confidentialité qu'elle peut utiliser), les réglages qu'elle choisit, et ne pas saisir de catégories particulières de données dans les notes ou messages. Elle donne ses instructions via les réglages de l'application ou par écrit.",
    ],
    acceptance:
      "L'Agence accepte ce contrat électroniquement lorsqu'elle crée son espace. Le Prestataire conserve la date et l'heure, l'identifiant qui l'a accepté et la version.",
    prevails: "Ce contrat existe en anglais, en néerlandais et en français. En cas de divergence entre les versions, la version anglaise prévaut.",
    annex1: {
      title: "Annexe 1 : le traitement",
      head: ["Quoi", "Détails"],
      rows: [
        ["Personnes concernées", "Candidats acheteurs et locataires, propriétaires demandant une estimation, propriétaires et locataires des biens proposés, le personnel de l'Agence (identifiants)"],
        [
          "Données",
          "Nom, e-mail, téléphone, langue, consentement WhatsApp ; visites et visites d'estimation ; réponses aux questions de réservation que l'Agence définit (par défaut : usage propre ou investissement, financement obtenu ou non, vente préalable nécessaire ou non, délai, date d'emménagement souhaitée, taille du ménage, animaux) ; messages échangés par e-mail et WhatsApp ; e-mails de leads des portails et du site, transférés à l'application ou lus dans une boîte Outlook connectée ; pour les estimations, l'adresse et les caractéristiques du bien ; les moments où propriétaires et locataires peuvent recevoir des visiteurs ; pour le personnel, nom, e-mail, rôle, jetons de la boîte mail et de l'agenda connectés (chiffrés) et sessions de connexion (adresse IP, navigateur) ; noms et coordonnées du personnel lus sur le site de l'Agence",
        ],
        [
          "Pas de catégories particulières",
          "L'application ne demande aucune donnée de santé, de religion ou d'origine ; elle demande si le financement est obtenu, ce qui est une information financière mais pas une catégorie particulière ; les messages libres peuvent contenir ce qu'un client écrit lui-même",
        ],
        [
          "Finalités",
          "Planifier, confirmer, rappeler, déplacer et annuler des visites ; répondre aux clients et les suivre ; préparer des réponses soumises à l'approbation du personnel ; estimer la valeur d'un bien ; prévenir les propriétaires et locataires des visites",
        ],
        [
          "Étapes automatisées",
          "Tri et projets de réponse par IA, toujours relus par le personnel avant envoi ; réponses, confirmations et rappels à texte fixe envoyés automatiquement, sauf si l'Agence choisit « Me demander d'abord » ; aucune décision produisant des effets juridiques pour une personne",
        ],
        [
          "Conservation",
          "Jusqu'à ce que l'Agence efface le client, ou automatiquement après 24 mois sans contact (réglage : 12, 24, 36, 60 mois ou jamais) ; les clients avec une offre ou une transaction et les propriétaires et locataires d'un bien sont conservés ; formulaires d'estimation non confirmés après 30 jours ; toutes les données dans les 30 jours suivant la fin du contrat",
        ],
        ["Où", "Hébergement dans l'UE (Francfort), sauf les transferts de l'Annexe 2"],
      ],
    },
    annex2: {
      title: "Annexe 2 : sous-traitants ultérieurs",
      intro:
        "L'application et sa base de données tournent à Francfort. Le contenu des messages quitte l'UE à deux endroits : le service d'IA et WhatsApp (Meta). Les deux sont mentionnés dans la déclaration de confidentialité destinée aux clients.",
      head: ["Sous-traitant", "Rôle", "Données", "Lieu", "Base du transfert"],
      rows: [
        ["Vercel Inc.", "Hébergement de l'application (région fra1)", "Toutes, pendant le traitement", "Francfort, Allemagne", "Société américaine : cadre UE-États-Unis + clauses contractuelles types (DPA de Vercel)"],
        ["Neon (Databricks)", "Base de données (région eu-central-1)", "Toutes, stockées", "Francfort, Allemagne", "Société américaine : DPF + clauses contractuelles types (DPA de Neon)"],
        [
          "Mailgun (Sinch)",
          "Envoi et réception d'e-mails depuis l'adresse de l'agence, région UE",
          "Adresses et contenu des e-mails, y compris les leads de portails transférés ; journaux de remise",
          "UE",
          "DPF + clauses contractuelles types pour tout accès du support",
        ],
        [
          "Anthropic PBC",
          "Tri et projets de réponse par IA (API Claude)",
          "Prénom et nom du client, la conversation (qui peut contenir des coordonnées écrites par le client), réponses aux questions de réservation, nom de l'agent et de l'agence, données du bien",
          "États-Unis",
          "Clauses contractuelles types dans le DPA d'Anthropic ; les données de l'API ne servent pas à entraîner des modèles",
        ],
        [
          "Meta Platforms Ireland",
          "Messages WhatsApp Business pour les clients qui ont écrit en premier ou ont donné leur accord (y compris confirmations et rappels par modèle), et la vérification du téléphone pour les estimations",
          "Numéro de téléphone, messages WhatsApp",
          "UE et États-Unis",
          "Conditions WhatsApp Business de Meta + clauses contractuelles types",
        ],
      ],
      note: "Ne sont pas nos sous-traitants : la boîte mail et l'agenda Microsoft 365 ou Google des agents. L'Agence a déjà un contrat avec eux ; l'application envoie des e-mails et inscrit des rendez-vous dans l'agenda par leur intermédiaire, avec les autorisations approuvées par l'agent, et dans une boîte Outlook connectée elle n'ouvre que les e-mails des portails immobiliers et du site de l'Agence.",
    },
    annex3: {
      title: "Annexe 3 : mesures de sécurité",
      head: ["Domaine", "Mesure en place"],
      rows: [
        ["Séparation entre agences", "Chaque requête est limitée à l'agence ; une agence ne peut jamais lire les données d'une autre"],
        [
          "Accès",
          "Les espaces ne sont créés qu'après approbation de l'agence par le Prestataire ; nouveaux identifiants uniquement via un lien envoyé par e-mail à cette adresse ; identifiants personnels par agent ; administrateurs et agents ont des droits différents ; mots de passe d'au moins 8 caractères, stockés hachés ; liens de réinitialisation valables 1 heure et une seule fois, et une réinitialisation déconnecte les autres sessions",
        ],
        ["Chiffrement", "HTTPS partout ; base de données chiffrée au repos ; jetons de boîte mail, d'agenda et WhatsApp chiffrés avec une clé distincte"],
        [
          "Minimisation",
          "Les boîtes mail servent à envoyer ; dans Outlook, l'application n'ouvre que les e-mails des portails immobiliers et du site de l'Agence, jamais d'autre courrier ; propriétaires et locataires ne voient les visiteurs que par prénom et initiale ; ventes comparables affichées par rue, jamais avec le numéro",
        ],
        ["Intégrité", "Les webhooks entrants (e-mail, WhatsApp) sont vérifiés par signature ; les réservations sont verrouillées par agent pour éviter les doublons"],
        ["Traçabilité", "Un journal de chaque modification (qui, quoi, quand) ; les effacements sont journalisés sans nommer la personne"],
        ["Disponibilité", "Base de données gérée dans l'UE avec restauration à un instant donné ; hébergement avec basculement automatique"],
        ["Secrets", "Clés uniquement dans les réglages chiffrés de l'hébergeur, jamais dans le code"],
        ["Personnes", "Accès à la production limité aux personnes qui gèrent la plateforme chez le Prestataire ; confidentialité dans les contrats de travail et de prestataires"],
      ],
    },
  },
};
