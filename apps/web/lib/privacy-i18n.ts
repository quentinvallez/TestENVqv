import type { WidgetLang } from "./widget-i18n";

/*
 * The privacy notice clients see for an agency (GDPR art. 13): the agency is the controller,
 * our platform its processor. Plain words, one short section per question a client has.
 */

type Facts = { agency: string; retentionMonths: number; contact: string };
type Section = { title: string; body: string[] };

export const privacyText: Record<WidgetLang, { title: (agency: string) => string; updated: string; languages: string; sections: (f: Facts) => Section[] }> = {
  nl: {
    title: (agency) => `Privacyverklaring van ${agency}`,
    updated: "Bijgewerkt op 22 november 2026",
    languages: "Taal",
    sections: (f) => [
      {
        title: "Wie is verantwoordelijk?",
        body: [
          `${f.agency} is verantwoordelijk voor uw gegevens (verwerkingsverantwoordelijke). Vragen of verzoeken stuurt u naar ${f.contact}.`,
          `${f.agency} gebruikt planningssoftware die uw gegevens enkel in opdracht van het kantoor verwerkt (verwerker), gehost in de Europese Unie.`,
        ],
      },
      {
        title: "Welke gegevens?",
        body: [
          "Uw naam, e-mailadres, telefoonnummer en taal; het bezoek of de schatting die u plant; uw antwoorden op de korte vragen; de berichten die u en het kantoor uitwisselen.",
          "Voor een online schatting ook het adres en de kenmerken van uw woning.",
          "Vroeg u een bezoek of informatie aan via Immoweb, Zimmo, Immovlan, Immoscoop of de website van het kantoor, dan komen uw gegevens uit het bericht dat die site naar de mailbox van het kantoor stuurde. De software leest in die mailbox enkel zulke aanvragen.",
        ],
      },
      {
        title: "Waarom?",
        body: [
          "Om uw bezoek te plannen, te bevestigen en u eraan te herinneren, en om u te antwoorden: dat vraagt u zelf (art. 6.1.b AVG).",
          "Om na een bezoek op te volgen en u verwante panden voor te stellen: het gerechtvaardigd belang van het kantoor (art. 6.1.f). U kunt zich daar altijd tegen verzetten.",
          "Om u te contacteren over een schatting: met uw toestemming (art. 6.1.a), die u altijd kunt intrekken.",
          "WhatsApp gebruiken we enkel als u zelf eerst schrijft of erom vraagt.",
        ],
      },
      {
        title: "Wie ziet ze?",
        body: [
          `De medewerkers van ${f.agency}. De eigenaar of huurder van een woning ziet enkel uw voornaam, de eerste letter van uw achternaam en het tijdstip van uw bezoek.`,
          "Dienstverleners die de software laten werken: hosting en database in Frankfurt, e-mail via de mailbox van uw makelaar of een Europese e-maildienst, WhatsApp (Meta) als u daarvoor kiest, en een AI-dienst die antwoorden helpt opstellen, die een medewerker naleest (buiten de EU, met de standaardcontractbepalingen van de EU). Uw gegevens worden nooit verkocht.",
        ],
      },
      {
        title: "Hoe lang?",
        body: [
          f.retentionMonths > 0
            ? `Zolang u contact hebt met het kantoor. Na ${f.retentionMonths} maanden zonder contact worden uw gegevens automatisch gewist, tenzij de wet langer bewaren vraagt (bijvoorbeeld na een aankoop of huur).`
            : "Zolang nodig voor uw vraag en zolang de wet het vraagt (bijvoorbeeld na een aankoop of huur).",
          "Een schattingsformulier waarvan het telefoonnummer nooit bevestigd werd, wordt na 30 dagen gewist.",
        ],
      },
      {
        title: "Uw rechten",
        body: [
          `U kunt uw gegevens inkijken, laten verbeteren of wissen, een kopie krijgen, zich verzetten tegen opvolging en uw toestemming intrekken. Schrijf naar ${f.contact}; u krijgt binnen een maand antwoord.`,
          "Niet tevreden? U kunt klacht indienen bij de Gegevensbeschermingsautoriteit (www.gegevensbeschermingsautoriteit.be).",
        ],
      },
    ],
  },
  fr: {
    title: (agency) => `Déclaration de confidentialité de ${agency}`,
    updated: "Mise à jour le 22 novembre 2026",
    languages: "Langue",
    sections: (f) => [
      {
        title: "Qui est responsable ?",
        body: [
          `${f.agency} est responsable de vos données (responsable du traitement). Envoyez vos questions ou demandes à ${f.contact}.`,
          `${f.agency} utilise un logiciel de planification qui traite vos données uniquement sur instruction de l'agence (sous-traitant), hébergé dans l'Union européenne.`,
        ],
      },
      {
        title: "Quelles données ?",
        body: [
          "Votre nom, votre adresse e-mail, votre téléphone et votre langue ; la visite ou l'estimation que vous planifiez ; vos réponses aux questions courtes ; les messages échangés avec l'agence.",
          "Pour une estimation en ligne, aussi l'adresse et les caractéristiques de votre bien.",
          "Si vous avez demandé une visite ou des informations via Immoweb, Zimmo, Immovlan, Immoscoop ou le site de l'agence, vos données viennent du message que ce site a envoyé à la boîte e-mail de l'agence. Le logiciel ne lit dans cette boîte que ces demandes.",
        ],
      },
      {
        title: "Pourquoi ?",
        body: [
          "Pour planifier et confirmer votre visite, vous la rappeler et vous répondre : c'est vous qui le demandez (art. 6.1.b RGPD).",
          "Pour faire le suivi après une visite et vous proposer des biens semblables : l'intérêt légitime de l'agence (art. 6.1.f). Vous pouvez toujours vous y opposer.",
          "Pour vous contacter au sujet d'une estimation : avec votre consentement (art. 6.1.a), que vous pouvez retirer à tout moment.",
          "Nous n'utilisons WhatsApp que si vous écrivez d'abord ou le demandez.",
        ],
      },
      {
        title: "Qui les voit ?",
        body: [
          `Le personnel de ${f.agency}. Le propriétaire ou locataire d'un bien ne voit que votre prénom, l'initiale de votre nom et l'heure de votre visite.`,
          "Les prestataires qui font fonctionner le logiciel : hébergement et base de données à Francfort, e-mail via la boîte de votre agent ou un service e-mail européen, WhatsApp (Meta) si vous le choisissez, et un service d'IA qui aide à rédiger des réponses, relues par un membre de l'agence (hors de l'UE, avec les clauses contractuelles types de l'UE). Vos données ne sont jamais vendues.",
        ],
      },
      {
        title: "Combien de temps ?",
        body: [
          f.retentionMonths > 0
            ? `Tant que vous êtes en contact avec l'agence. Après ${f.retentionMonths} mois sans contact, vos données sont effacées automatiquement, sauf si la loi impose de les garder plus longtemps (par exemple après un achat ou une location).`
            : "Le temps nécessaire pour votre demande et aussi longtemps que la loi l'impose (par exemple après un achat ou une location).",
          "Un formulaire d'estimation dont le téléphone n'a jamais été confirmé est effacé après 30 jours.",
        ],
      },
      {
        title: "Vos droits",
        body: [
          `Vous pouvez consulter, corriger ou effacer vos données, en recevoir une copie, vous opposer au suivi et retirer votre consentement. Écrivez à ${f.contact} ; vous recevrez une réponse dans le mois.`,
          "Pas satisfait ? Vous pouvez porter plainte auprès de l'Autorité de protection des données (www.autoriteprotectiondonnees.be).",
        ],
      },
    ],
  },
  en: {
    title: (agency) => `Privacy notice of ${agency}`,
    updated: "Updated 22 November 2026",
    languages: "Language",
    sections: (f) => [
      {
        title: "Who is responsible?",
        body: [
          `${f.agency} is responsible for your data (the controller). Send questions or requests to ${f.contact}.`,
          `${f.agency} uses planning software that processes your data only on the agency's instructions (a processor), hosted in the European Union.`,
        ],
      },
      {
        title: "What data?",
        body: [
          "Your name, email address, phone number and language; the viewing or valuation you book; your answers to the short questions; the messages you and the agency exchange.",
          "For an online valuation, also the address and features of your home.",
          "If you asked for a viewing or information through Immoweb, Zimmo, Immovlan, Immoscoop or the agency's website, your data comes from the message that site sent to the agency's mailbox. The software only reads such requests in that mailbox.",
        ],
      },
      {
        title: "Why?",
        body: [
          "To plan and confirm your viewing, remind you of it and answer you: you ask for it yourself (GDPR art. 6.1.b).",
          "To follow up after a viewing and suggest similar properties: the agency's legitimate interest (art. 6.1.f). You can always object.",
          "To contact you about a valuation: with your consent (art. 6.1.a), which you can withdraw at any time.",
          "We only use WhatsApp when you write first or ask for it.",
        ],
      },
      {
        title: "Who sees it?",
        body: [
          `The staff of ${f.agency}. The owner or tenant of a home only sees your first name, the initial of your last name and the time of your viewing.`,
          "The providers that run the software: hosting and database in Frankfurt, email through your agent's mailbox or a European email service, WhatsApp (Meta) if you choose it, and an AI service that helps draft replies, which a member of staff reads first (outside the EU, under the EU's standard contractual clauses). Your data is never sold.",
        ],
      },
      {
        title: "How long?",
        body: [
          f.retentionMonths > 0
            ? `As long as you are in touch with the agency. After ${f.retentionMonths} months without contact your data is erased automatically, unless the law requires keeping it longer (for example after a purchase or rental).`
            : "As long as needed for your request, and as long as the law requires (for example after a purchase or rental).",
          "A valuation form whose phone number was never confirmed is erased after 30 days.",
        ],
      },
      {
        title: "Your rights",
        body: [
          `You can see, correct or erase your data, get a copy, object to follow-ups and withdraw your consent. Write to ${f.contact}; you'll get an answer within a month.`,
          "Not satisfied? You can complain to the Belgian Data Protection Authority (www.dataprotectionauthority.be).",
        ],
      },
    ],
  },
  de: {
    title: (agency) => `Datenschutzhinweis von ${agency}`,
    updated: "Aktualisiert am 22. November 2026",
    languages: "Sprache",
    sections: (f) => [
      {
        title: "Wer ist verantwortlich?",
        body: [
          `${f.agency} ist für Ihre Daten verantwortlich (Verantwortlicher). Fragen oder Anträge senden Sie an ${f.contact}.`,
          `${f.agency} nutzt eine Planungssoftware, die Ihre Daten nur im Auftrag des Büros verarbeitet (Auftragsverarbeiter), gehostet in der Europäischen Union.`,
        ],
      },
      {
        title: "Welche Daten?",
        body: [
          "Ihr Name, Ihre E-Mail-Adresse, Telefonnummer und Sprache; die Besichtigung oder Bewertung, die Sie buchen; Ihre Antworten auf die kurzen Fragen; die Nachrichten zwischen Ihnen und dem Büro.",
          "Bei einer Online-Bewertung auch die Adresse und die Merkmale Ihrer Immobilie.",
          "Haben Sie eine Besichtigung oder Informationen über Immoweb, Zimmo, Immovlan, Immoscoop oder die Website des Büros angefragt, stammen Ihre Daten aus der Nachricht, die diese Seite an das Postfach des Büros geschickt hat. Die Software liest in diesem Postfach nur solche Anfragen.",
        ],
      },
      {
        title: "Warum?",
        body: [
          "Um Ihre Besichtigung zu planen, zu bestätigen, Sie daran zu erinnern und Ihnen zu antworten: Sie fragen selbst danach (Art. 6 Abs. 1 lit. b DSGVO).",
          "Um nach einer Besichtigung nachzufassen und ähnliche Immobilien vorzuschlagen: das berechtigte Interesse des Büros (Art. 6 Abs. 1 lit. f). Sie können jederzeit widersprechen.",
          "Um Sie zu einer Bewertung zu kontaktieren: mit Ihrer Einwilligung (Art. 6 Abs. 1 lit. a), die Sie jederzeit widerrufen können.",
          "WhatsApp nutzen wir nur, wenn Sie zuerst schreiben oder darum bitten.",
        ],
      },
      {
        title: "Wer sieht sie?",
        body: [
          `Die Mitarbeitenden von ${f.agency}. Der Eigentümer oder Mieter einer Immobilie sieht nur Ihren Vornamen, den ersten Buchstaben Ihres Nachnamens und die Uhrzeit Ihrer Besichtigung.`,
          "Dienstleister, die die Software betreiben: Hosting und Datenbank in Frankfurt, E-Mail über das Postfach Ihres Maklers oder einen europäischen E-Mail-Dienst, WhatsApp (Meta), wenn Sie es wählen, und ein KI-Dienst, der beim Formulieren von Antworten hilft, die ein Mitarbeiter zuerst liest (außerhalb der EU, mit den Standardvertragsklauseln der EU). Ihre Daten werden nie verkauft.",
        ],
      },
      {
        title: "Wie lange?",
        body: [
          f.retentionMonths > 0
            ? `Solange Sie mit dem Büro in Kontakt sind. Nach ${f.retentionMonths} Monaten ohne Kontakt werden Ihre Daten automatisch gelöscht, es sei denn, das Gesetz verlangt eine längere Aufbewahrung (zum Beispiel nach einem Kauf oder einer Miete).`
            : "Solange es für Ihre Anfrage nötig ist und das Gesetz es verlangt (zum Beispiel nach einem Kauf oder einer Miete).",
          "Ein Bewertungsformular, dessen Telefonnummer nie bestätigt wurde, wird nach 30 Tagen gelöscht.",
        ],
      },
      {
        title: "Ihre Rechte",
        body: [
          `Sie können Ihre Daten einsehen, berichtigen oder löschen lassen, eine Kopie erhalten, der Nachverfolgung widersprechen und Ihre Einwilligung widerrufen. Schreiben Sie an ${f.contact}; Sie erhalten innerhalb eines Monats eine Antwort.`,
          "Nicht zufrieden? Sie können sich bei der belgischen Datenschutzbehörde beschweren (www.dataprotectionauthority.be).",
        ],
      },
    ],
  },
};
