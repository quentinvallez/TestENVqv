import type { WidgetLang } from "./widget-i18n";

type Options = Record<string, string>;
type Text = {
  /** The floating button widget.js shows on every page of the agency's site. */
  launcher: string;
  close: string;
  title: string;
  intro: string;
  steps: [string, string, string, string];
  street: string;
  number: string;
  postcode: string;
  city: string;
  type: string;
  types: Options;
  livingArea: string;
  plotArea: string;
  bedrooms: string;
  bathrooms: string;
  yearBuilt: string;
  condition: string;
  conditions: Options;
  epc: string;
  epcUnknown: string;
  kitchen: string;
  kitchens: Options;
  extras: string;
  extraOptions: Options;
  plans: string;
  planOptions: Options;
  firstName: string;
  phone: string;
  email: string;
  consent: (agency: string) => string;
  next: string;
  back: string;
  submit: string;
  verifyTitle: string;
  verifyWhatsApp: string;
  verifyHint: string;
  demoCode: (code: string) => string;
  code: string;
  verify: string;
  wrongCode: string;
  resultTitle: string;
  confidence: Options;
  fullReport: string;
  noEstimate: string;
  error: string;
  report: {
    title: string;
    disclaimer: string;
    marketTitle: string;
    market: (municipality: string, period: string, n: number) => string;
    noMarket: string;
    comparablesTitle: string;
    comparablesNote: string;
    sold: string;
    adjustmentsTitle: string;
    adjustments: Options;
    visitTitle: string;
    visitText: (agent: string) => string;
    book: string;
    booked: (when: string) => string;
  };
};

export const valuationText: Record<WidgetLang, Text> = {
  nl: {
    launcher: "Gratis waardebepaling",
    close: "Sluiten",
    title: "Wat is mijn woning waard?",
    intro: "Gratis schatting op basis van verkoopprijzen in uw gemeente en recente verkopen van ons kantoor.",
    steps: ["Adres", "Woning", "Staat", "Uw gegevens"],
    street: "Straat",
    number: "Nr.",
    postcode: "Postcode",
    city: "Gemeente",
    type: "Type woning",
    types: { house: "Huis", apartment: "Appartement", villa: "Villa / open bebouwing" },
    livingArea: "Bewoonbare oppervlakte (m²)",
    plotArea: "Perceel (m²)",
    bedrooms: "Slaapkamers",
    bathrooms: "Badkamers",
    yearBuilt: "Bouwjaar (optioneel)",
    condition: "Staat van de woning",
    conditions: { to_renovate: "Te renoveren", good: "Goed", renovated: "Gerenoveerd", new: "Nieuwbouw" },
    epc: "EPC-label",
    epcUnknown: "Weet ik niet",
    kitchen: "Keuken",
    kitchens: { basic: "Eenvoudig", standard: "Standaard", high_end: "Luxe" },
    extras: "Extra's",
    extraOptions: { garage: "Garage", garden: "Tuin", terrace: "Terras", pool: "Zwembad", solar: "Zonnepanelen" },
    plans: "Wat zijn uw plannen?",
    planOptions: { sell_soon: "Verkopen binnen 6 maanden", sell_later: "Later verkopen", curious: "Gewoon benieuwd" },
    firstName: "Voornaam",
    phone: "GSM-nummer",
    email: "E-mail (optioneel)",
    consent: (agency) => `Ik ga akkoord dat ${agency} mij contacteert over deze schatting.`,
    next: "Volgende",
    back: "Terug",
    submit: "Toon mijn schatting",
    verifyTitle: "Bevestig uw nummer",
    verifyWhatsApp: "Bevestig via WhatsApp",
    verifyHint: "Stuur het vooraf ingevulde bericht en vul daarna de code in, of wacht even tot we ze ontvangen.",
    demoCode: (code) => `Demo: WhatsApp is nog niet gekoppeld. Uw code is ${code}.`,
    code: "Code",
    verify: "Bevestigen",
    wrongCode: "Deze code klopt niet.",
    resultTitle: "Geschatte waarde",
    confidence: { high: "Hoge betrouwbaarheid", medium: "Gemiddelde betrouwbaarheid", low: "Ruwe indicatie" },
    fullReport: "Bekijk het volledige rapport",
    noEstimate: "Voor dit adres hebben we te weinig gegevens voor een betrouwbare online schatting. Onze makelaar neemt contact op voor een gratis schatting ter plaatse.",
    error: "Er ging iets mis. Controleer uw gegevens.",
    report: {
      title: "Schattingsrapport",
      disclaimer: "Indicatieve online schatting, geen officiële waardebepaling door een erkend vastgoedmakelaar.",
      marketTitle: "Markt in uw gemeente",
      market: (m, p, n) => `Mediaanprijs in ${m} over de laatste 12 maanden (${p}), op basis van ${n} verkopen (bron: Statbel)`,
      noMarket: "Nog geen officiële marktcijfers beschikbaar voor deze gemeente; de schatting steunt op recente verkopen van ons kantoor.",
      comparablesTitle: "Recent verkocht in de buurt",
      comparablesNote: "Verkopen van ons kantoor; per straat getoond om privacyredenen.",
      sold: "Verkocht",
      adjustmentsTitle: "Wat de schatting beïnvloedt",
      adjustments: { size: "Oppervlakte", condition: "Staat", epc: "EPC", kitchen: "Keuken", bathrooms: "Badkamers", garage: "Garage", garden: "Tuin", terrace: "Terras", pool: "Zwembad", solar: "Zonnepanelen", large_plot: "Groot perceel" },
      visitTitle: "Gratis waardebepaling ter plaatse",
      visitText: (agent) => `${agent} komt vrijblijvend langs voor een nauwkeurige waardebepaling. Kies een moment:`,
      book: "Afspraak bevestigen",
      booked: (when) => `Uw afspraak is bevestigd: ${when}.`,
    },
  },
  fr: {
    launcher: "Estimation gratuite",
    close: "Fermer",
    title: "Combien vaut mon bien ?",
    intro: "Estimation gratuite basée sur les prix de vente dans votre commune et les ventes récentes de notre agence.",
    steps: ["Adresse", "Bien", "État", "Vos coordonnées"],
    street: "Rue",
    number: "N°",
    postcode: "Code postal",
    city: "Commune",
    type: "Type de bien",
    types: { house: "Maison", apartment: "Appartement", villa: "Villa / 4 façades" },
    livingArea: "Surface habitable (m²)",
    plotArea: "Terrain (m²)",
    bedrooms: "Chambres",
    bathrooms: "Salles de bain",
    yearBuilt: "Année de construction (facultatif)",
    condition: "État du bien",
    conditions: { to_renovate: "À rénover", good: "Bon", renovated: "Rénové", new: "Neuf" },
    epc: "Label PEB",
    epcUnknown: "Je ne sais pas",
    kitchen: "Cuisine",
    kitchens: { basic: "Simple", standard: "Standard", high_end: "Haut de gamme" },
    extras: "Extras",
    extraOptions: { garage: "Garage", garden: "Jardin", terrace: "Terrasse", pool: "Piscine", solar: "Panneaux solaires" },
    plans: "Quels sont vos projets ?",
    planOptions: { sell_soon: "Vendre dans les 6 mois", sell_later: "Vendre plus tard", curious: "Simple curiosité" },
    firstName: "Prénom",
    phone: "GSM",
    email: "E-mail (facultatif)",
    consent: (agency) => `J'accepte que ${agency} me contacte au sujet de cette estimation.`,
    next: "Suivant",
    back: "Retour",
    submit: "Voir mon estimation",
    verifyTitle: "Confirmez votre numéro",
    verifyWhatsApp: "Confirmer via WhatsApp",
    verifyHint: "Envoyez le message prérempli, puis saisissez le code, ou attendez que nous le recevions.",
    demoCode: (code) => `Démo : WhatsApp n'est pas encore connecté. Votre code est ${code}.`,
    code: "Code",
    verify: "Confirmer",
    wrongCode: "Ce code n'est pas correct.",
    resultTitle: "Valeur estimée",
    confidence: { high: "Fiabilité élevée", medium: "Fiabilité moyenne", low: "Indication approximative" },
    fullReport: "Voir le rapport complet",
    noEstimate: "Nous n'avons pas assez de données pour une estimation en ligne fiable à cette adresse. Notre agent vous contactera pour une estimation gratuite sur place.",
    error: "Une erreur s'est produite. Vérifiez vos données.",
    report: {
      title: "Rapport d'estimation",
      disclaimer: "Estimation indicative en ligne, pas une expertise officielle par un agent immobilier agréé.",
      marketTitle: "Le marché dans votre commune",
      market: (m, p, n) => `Prix médian à ${m} sur les 12 derniers mois (${p}), sur base de ${n} ventes (source : Statbel)`,
      noMarket: "Pas encore de chiffres officiels pour cette commune ; l'estimation se base sur les ventes récentes de notre agence.",
      comparablesTitle: "Vendu récemment dans le quartier",
      comparablesNote: "Ventes de notre agence ; affichées par rue pour des raisons de confidentialité.",
      sold: "Vendu",
      adjustmentsTitle: "Ce qui influence l'estimation",
      adjustments: { size: "Surface", condition: "État", epc: "PEB", kitchen: "Cuisine", bathrooms: "Salles de bain", garage: "Garage", garden: "Jardin", terrace: "Terrasse", pool: "Piscine", solar: "Panneaux solaires", large_plot: "Grand terrain" },
      visitTitle: "Estimation gratuite sur place",
      visitText: (agent) => `${agent} passe sans engagement pour une estimation précise. Choisissez un moment :`,
      book: "Confirmer le rendez-vous",
      booked: (when) => `Votre rendez-vous est confirmé : ${when}.`,
    },
  },
  en: {
    launcher: "Free valuation",
    close: "Close",
    title: "What is my home worth?",
    intro: "Free estimate based on sale prices in your municipality and recent sales by our agency.",
    steps: ["Address", "Home", "Condition", "Your details"],
    street: "Street",
    number: "No.",
    postcode: "Postcode",
    city: "Municipality",
    type: "Type of home",
    types: { house: "House", apartment: "Apartment", villa: "Villa / detached" },
    livingArea: "Living area (m²)",
    plotArea: "Plot (m²)",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    yearBuilt: "Year built (optional)",
    condition: "Condition",
    conditions: { to_renovate: "To renovate", good: "Good", renovated: "Renovated", new: "New build" },
    epc: "EPC label",
    epcUnknown: "Don't know",
    kitchen: "Kitchen",
    kitchens: { basic: "Basic", standard: "Standard", high_end: "High-end" },
    extras: "Extras",
    extraOptions: { garage: "Garage", garden: "Garden", terrace: "Terrace", pool: "Pool", solar: "Solar panels" },
    plans: "What are your plans?",
    planOptions: { sell_soon: "Sell within 6 months", sell_later: "Sell later", curious: "Just curious" },
    firstName: "First name",
    phone: "Mobile number",
    email: "Email (optional)",
    consent: (agency) => `I agree that ${agency} may contact me about this estimate.`,
    next: "Next",
    back: "Back",
    submit: "Show my estimate",
    verifyTitle: "Confirm your number",
    verifyWhatsApp: "Confirm via WhatsApp",
    verifyHint: "Send the prefilled message, then enter the code, or wait until we receive it.",
    demoCode: (code) => `Demo: WhatsApp isn't connected yet. Your code is ${code}.`,
    code: "Code",
    verify: "Confirm",
    wrongCode: "That code isn't right.",
    resultTitle: "Estimated value",
    confidence: { high: "High confidence", medium: "Medium confidence", low: "Rough indication" },
    fullReport: "See the full report",
    noEstimate: "We don't have enough data for a reliable online estimate at this address. Our agent will contact you for a free valuation on site.",
    error: "Something went wrong. Please check your details.",
    report: {
      title: "Valuation report",
      disclaimer: "Indicative online estimate, not an official valuation by an accredited estate agent.",
      marketTitle: "The market in your municipality",
      market: (m, p, n) => `Median price in ${m} over the last 12 months (${p}), based on ${n} sales (source: Statbel)`,
      noMarket: "No official market figures for this municipality yet; the estimate is based on our agency's recent sales.",
      comparablesTitle: "Recently sold nearby",
      comparablesNote: "Sales by our agency; shown by street for privacy.",
      sold: "Sold",
      adjustmentsTitle: "What affects the estimate",
      adjustments: { size: "Size", condition: "Condition", epc: "EPC", kitchen: "Kitchen", bathrooms: "Bathrooms", garage: "Garage", garden: "Garden", terrace: "Terrace", pool: "Pool", solar: "Solar panels", large_plot: "Large plot" },
      visitTitle: "Free valuation visit",
      visitText: (agent) => `${agent} will come by, without obligation, for an accurate valuation. Pick a time:`,
      book: "Confirm appointment",
      booked: (when) => `Your appointment is confirmed: ${when}.`,
    },
  },
};
