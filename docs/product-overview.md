# Productbeschrijving: Viewing

> Werknaam: **Viewing**. De naam is een codenaam en nog niet definitief.
> Dit document beschrijft wat het product vandaag doet, voor wie het is en waarom het zo gebouwd is. Het is bedoeld als context voor branding, de website, marketing en sales. Alles hieronder komt uit de code zelf. Wat nog niet gebouwd is, staat apart onder "Nog niet beschikbaar" en mag niet als bestaande functie verkocht worden.

---

## 1. In één zin

Viewing is het AI-native platform voor Belgische vastgoedkantoren dat leads van Immoweb, Zimmo, Immovlan en de eigen website automatisch opvolgt: het antwoordt in de taal van de klant, plant bezichtigingen in de agenda van de juiste makelaar, stuurt bevestigingen en herinneringen, en legt alles wat gevoelig is eerst ter goedkeuring voor.

### Kortere varianten

- "Je planningsassistent die nooit slaapt: van portal-lead tot bezoek in de agenda."
- "Leads in, bezoeken gepland, klanten op de hoogte. Jij keurt goed."
- "Het AI-platform voor vastgoedkantoren, gemaakt in en voor België."

## 2. Het probleem

Een Belgisch vastgoedkantoor krijgt dagelijks aanvragen via Immoweb, Zimmo, Immovlan, de eigen website, e-mail, WhatsApp en telefoon. Daarna volgt veel handwerk:

- **Trage opvolging.** Portal-leads komen binnen als e-mail en blijven liggen tot iemand tijd heeft. Wie het eerst antwoordt, krijgt vaak de koper.
- **Heen-en-weer over afspraken.** Een bezichtiging plannen kost meerdere berichten: wanneer kan de makelaar, wanneer kan de bewoner, wanneer kan de kandidaat.
- **Bewoonde panden.** Bij een eigenaar of huurder die er nog woont, moet elk bezoek ook in hun agenda passen.
- **Meertaligheid.** Klanten schrijven in het Nederlands, Frans of Engels.
- **Vergeten opvolging.** Herinneringen, de vraag "hoe vond u het?" na een bezoek, nieuwe momenten na een no-show en het opvolgen van stille leads gebeuren onregelmatig.
- **Pand niet meer beschikbaar.** Komt een pand onder optie of is het verkocht, dan moeten alle geplande bezoekers verwittigd worden.
- **Verkopers vinden.** Eigenaars die willen weten wat hun woning waard is, zijn de belangrijkste bron van nieuwe opdrachten, maar de website vangt ze zelden op.

## 3. Voor wie

- **Primair:** Belgische vastgoedkantoren (verkoop en verhuur), van één kantoor met enkele makelaars tot kantoren met meerdere vestigingen.
- **Gebruikers in het kantoor:** zaakvoerders, makelaars, office managers en back-office.
- **Wie het product ook ziet, zonder account:**
  - kandidaat-kopers en -huurders (boekingswidget, bevestigingen, eigen link om te wijzigen);
  - eigenaars en huurders van bewoonde panden (privélink met hun beschikbaarheid);
  - eigenaars die hun woning willen laten schatten (waarderingswidget).
- **Markt:** België, drietalig (NL, FR, EN), met Belgische portals, Statbel-prijsdata en Belgische regels (EPC, antidiscriminatie bij verhuur).

## 4. Wat het product doet

### 4.1 Planningsagent en inbox

Het hart van het product. Alle gesprekken over e-mail en WhatsApp komen samen in één inbox.

- **Triage:** de planner leest elk binnenkomend bericht en bepaalt categorie, prioriteit, taal en een korte samenvatting. Dringende gesprekken en gesprekken met een klaar concept staan bovenaan.
- **Conceptantwoord:** de planner schrijft een antwoord in de taal van de klant. Dat concept wacht in de inbox. De makelaar kan het goedkeuren, aanpassen of verwerpen.
- **Tijden komen altijd uit de agenda:** de AI schrijft nooit zelf data, uren of links. Vrije momenten en de boekingslink komen uit de boekingsmotor en worden onder het bericht gezet. Er wordt dus nooit een moment voorgesteld dat niet vrij is.
- **Altijd een plan B:** elke AI-functie heeft een vaste sjabloon- of regelversie. Het product werkt ook zonder AI, en de interface toont altijd of een concept door AI of door een sjabloon gemaakt is.
- **Herschrijven op vraag:** "lees opnieuw en maak een nieuw concept".

### 4.2 Portal-leads (Immoweb, Zimmo, Immovlan)

- Leads komen binnen als doorgestuurde e-mails, worden herkend en gekoppeld aan het juiste pand en de juiste makelaar.
- **Automatisch antwoord op bezoekaanvragen:** vraagt een lead om een actief pand te bezoeken, dan antwoordt de planner meteen met vrije momenten en de boekingslink, in vaste tekst in de taal van de klant. De AI herkent alleen de vraag. Voor panden onder optie of verkocht en voor gewone vragen blijft het een concept.
- **Eenvoudige installatie** (Instellingen → Portal-leads):
  - Outlook: doorstuurregel met één klik, met een automatische test die controleert of Microsoft 365 het doorsturen toelaat;
  - Gmail: de bevestigingscode wordt in het scherm getoond;
  - aanbevolen: de portals sturen rechtstreeks naar het inboxadres van het kantoor. De originele portal-mail gaat dan nog als kopie naar de makelaar.
- Andere portal-mail (nieuwsbrieven en dergelijke) wordt genegeerd.

### 4.3 Bezichtigingen boeken

- **Boekingsmotor:** vrije momenten = werkuren van de makelaar − bestaande afspraken − afspraken in de eigen Google- of Outlook-agenda − reistijd tussen panden.
- **Nooit dubbel geboekt:** elke boeking controleert het moment opnieuw op het laatste ogenblik, ook als twee mensen tegelijk boeken.
- **Agenda-synchronisatie** met Google Calendar en Outlook. De bezichtiging komt in de agenda van de makelaar. De klant krijgt geen agenda-uitnodiging van de makelaar.
- **Persoonlijke link voor de klant:** in elke bevestiging en herinnering staat een link waarmee de klant zelf het bezoek verplaatst of annuleert.
- **Kwalificatievragen** tijdens het boeken, zodat de makelaar weet wie hij of zij ontmoet:
  - koop: zelf wonen of investering, financieringsakkoord, eerst huidige woning verkopen, timing;
  - huur: wanneer intrekken, aantal personen, huisdieren. Bewust beperkt tot wat de Belgische antidiscriminatieregels toelaten.
- **Mail naar de makelaar** bij elke boeking, verplaatsing of annulatie door een klant, op het eigen adres van de makelaar (uitschakelbaar).

### 4.4 Bewoonde panden: eigenaars en huurders

- Per pand stel je in wie de sleutel heeft: het kantoor, de eigenaar of de huurder.
- Eigenaars en huurders krijgen een **privélink, zonder account**. Daar geven ze in wanneer de woning bezocht mag worden, wanneer ze weg zijn en hoeveel voorafgaande verwittiging ze nodig hebben.
- Alleen momenten die zowel voor de makelaar als voor de bewoners passen, worden aangeboden. Bezoeken aan hetzelfde huis worden na elkaar gepland, zonder reistijd.
- Bewoners zien de komende bezoeken, maar **bezoekers enkel als voornaam en initiaal**, nooit met contactgegevens. Ze kunnen een probleem melden en zich abonneren op een agendafeed (iCal).
- Ze krijgen automatisch een bericht bij elke boeking, verplaatsing of annulatie en de avond voordien.
- Wijzigt een bewoner zijn beschikbaarheid, dan wordt niets automatisch geannuleerd. De bezoeker krijgt een concept met de vraag om te verplaatsen.
- Zonder ingegeven beschikbaarheid kunnen bezoekers alleen een aanvraag doen.

### 4.5 Automatische opvolging

Deze taken lopen vanzelf, met vaste teksten in de taal van de klant (nooit AI-tekst):

| Taak | Wat er gebeurt |
|---|---|
| Bevestiging | Na een boeking of verplaatsing door de klant zelf |
| Herinnering | De avond voor elke bezichtiging en elk waarderingsbezoek: tijd, adres, makelaar en link om te wijzigen |
| Opvolging | Een uur na het bezoek wordt het als afgerond gemarkeerd; de volgende dag vraagt een bericht hoe het bezoek was |
| No-show | Markeert de makelaar dat iemand niet kwam, dan krijgt die een vriendelijk bericht met nieuwe momenten |
| Stille leads | Antwoordt een lead enkele dagen niet, dan volgt een korte check-in (maximaal twee, nooit na een boeking) |
| Pand niet meer beschikbaar | Gaat een pand onder optie, verkocht, verhuurd of offline, dan wordt een bericht opgesteld voor elke klant met een gepland bezoek; bij goedkeuring wordt het verstuurd en het bezoek geannuleerd |

Elke taak gebeurt maximaal één keer per onderwerp. Klanten krijgen dus nooit dubbele berichten.

### 4.6 Autonomie: het kantoor kiest

Per soort bericht kiest het kantoor:

- **"Doe het"**: routineberichten gaan vanzelf de deur uit (standaard voor bevestigingen, herinneringen, opvolging, no-shows, check-ins en antwoorden op portal-bezoekaanvragen);
- **"Vraag het me eerst"**: elk bericht wacht in de inbox op goedkeuring.

Antwoorden op echte vragen en alle door AI geschreven teksten wachten altijd op een mens. Paars (de AI-kleur) toont in de interface overal wat de AI deed of voorstelt.

### 4.7 Kanalen

- **E-mail** vanuit de eigen Gmail- of Outlook-mailbox van de makelaar (alleen verzendrechten: **wij lezen nooit mailboxen**), of vanuit het inboxadres van het kantoor. Antwoorden komen altijd terug in de inbox.
- **WhatsApp Business** met het eigen nummer van het kantoor, of tijdens een pilot met een gedeeld nummer. Klanten kunnen bij het boeken kiezen om bevestiging en herinnering via WhatsApp te krijgen.
- **Eerlijk over levering:** zolang er geen kanaal gekoppeld is, worden berichten bewaard als "gesimuleerd" en nooit als verstuurd voorgesteld.

### 4.8 Websitewidget

Eén script op de eigen website van het kantoor:

- **Boekingsknop op elke panddetailpagina**, ook zonder extra werk: het script herkent de pagina als pand en toont een zwevende knop. De boeking gaat naar de makelaar die op de pagina staat, anders naar de verantwoordelijke makelaar van het pand.
- **Zwevende waarderingsknop** rechtsonder op elke pagina, in de kleur van het kantoor, schermvullend op gsm.
- Drietalig, werkt op gsm, en de stijl van de site van het kantoor kan de widget niet breken.
- Een installatiecheck toont of het script effectief draait.

### 4.9 Panden automatisch van de eigen website

- Het platform leest de panden rechtstreeks van de website van het kantoor (dagelijkse synchronisatie). Er moet niets dubbel ingevoerd worden.
- Het overloopt alle overzichtspagina's (ook paginering, zoekformulieren en sitemaps), ook nieuwbouwprojecten met hun units.
- Het importscherm toont per overzicht hoeveel panden de site zelf vermeldt en hoeveel er gevonden zijn.
- Gegevens worden met regels uit de pagina gehaald. Alleen als die belangrijke feiten missen, leest Claude de pagina, en dat staat dan zichtbaar als "Gelezen door Claude".
- Een nieuwe pandpagina waarop de widget draait, wordt in de achtergrond gelezen en toegevoegd.

### 4.10 Online woningwaardering (verkopersleads)

- Een eigenaar beantwoordt enkele vragen over de woning: type, oppervlakte, staat, EPC, keuken, badkamers en extra's.
- **Telefoonverificatie vóór het resultaat:** het kantoor krijgt echte, gecontroleerde verkopersleads (met een vooraf ingevulde code via WhatsApp).
- **Transparant, uitlegbaar model, zonder AI in de bedragen:**
  1. mediaanprijs van Statbel voor de gemeente en het woningtype;
  2. aangepast voor oppervlakte, staat, EPC en uitrusting;
  3. gemengd met de eigen recente verkopen van het kantoor in de buurt;
  4. een vork waarvan de breedte toont hoeveel data er is.
- Vergelijkbare panden worden getoond **per straat, nooit met huisnummer**.
- De eigenaar kan meteen een **waarderingsbezoek** boeken bij de juiste makelaar. De verkoperslead komt bij de planner terecht.

### 4.11 Aanbevelingen

- "Misschien vindt u dit ook leuk" op de website: vergelijkbare actieve panden (soort, prijsklasse, grootte, buurt).
- Voor gekende klanten: panden die passen bij waar ze eerder interesse in toonden, met de reden erbij.
- Bij een nieuw pand: welke klanten interesse toonden in iets vergelijkbaars en het nog niet zagen. Per klant wordt een persoonlijk bericht opgesteld, ter goedkeuring.

### 4.12 Back office

- **Dashboard:** nieuwe leads deze week, bezoeken vandaag en deze week, actieve panden, wachtende goedkeuringen, komende afspraken, activiteit.
- **Inbox**, **Agenda**, **Panden**, **Leads** (pijplijn: nieuw → uitgenodigd → geboekt → bezocht → opvolging → bod → gewonnen/verloren), **Afspraken**, **Contacten** (met volledige historiek en kwalificatie-antwoorden), **Makelaars** (werkuren, bezoekduur, reistijd, gekoppelde agenda en mailbox).
- **Website & widget**, **Widget-previews**, **Instellingen**.
- Volledig bruikbaar op gsm: tabbalk onderaan, kaartjes in plaats van tabellen, geen acties die alleen met hover of slepen werken. Licht en donker thema.
- Demodata met één klik, om het product meteen te tonen.

### 4.13 Widget-previews (salestool)

- Vul de website van een prospect in en je krijgt een link (30 dagen geldig) die **onze widget op hun eigen panden** toont, in hun kleur en op hun eigen site of een getrouwe weergave ervan.
- Er wordt niets op hun site geplaatst, niets geboekt en niets verstuurd.
- Je ziet hoe vaak de link geopend werd en of iemand probeerde te boeken.
- Kantoren kunnen er zelf een aanvragen via een publieke pagina (website + e-mail).

## 5. Wat ons onderscheidt

1. **AI-native, geen CRM met een chatbot.** Elke actie in het product is een "tool" die zowel de interface als de AI-agents gebruiken. De agents doen dus echt werk, met dezelfde regels als een mens.
2. **De mens keurt goed; het kantoor kiest de autonomie.** Routine gaat vanzelf, gevoelige zaken wachten op een makelaar. Wat AI deed, is altijd zichtbaar (paars).
3. **De AI verzint geen feiten.** Tijden, links, prijzen en schattingen komen uit de agenda, de boekingsmotor of het waarderingsmodel, nooit uit tekstgeneratie.
4. **Werkt ook zonder AI.** Elke AI-stap heeft een sjabloon- of regelversie.
5. **Gemaakt voor België:** Immoweb, Zimmo, Immovlan, NL/FR/EN, Statbel, EPC-regels, antidiscriminatie bij verhuur, Europe/Brussels-tijd.
6. **Bewoonde panden goed geregeld:** eigenaars en huurders beslissen mee, met respect voor de privacy van bezoekers.
7. **Respect voor privacy en data:** alles in de EU (Frankfurt), we lezen geen mailboxen, alleen verzendrechten, tokens versleuteld, bewoners zien geen contactgegevens, vergelijkbare panden zonder huisnummer.
8. **Eerlijk:** een bericht dat niet verzonden is, wordt nooit als verzonden getoond.
9. **Geen dubbel werk:** panden komen van de eigen website, agenda's synchroniseren, portal-leads stromen vanzelf binnen.
10. **Snel te installeren:** één script op de website, één klik voor de Outlook-regel, demodata om meteen te starten.

## 6. Merkwaarden en tone of voice

Afgeleid uit hoe het product gebouwd en geformuleerd is:

- **Betrouwbaar:** nooit dubbel geboekt, nooit iets verzonnen, nooit iets als verzonden getoond dat het niet is.
- **Kalm en efficiënt:** het product neemt routine weg zonder lawaai.
- **Transparant:** je ziet altijd wat AI deed, waarom een schatting is wat ze is, en wie een concept maakte.
- **Respectvol:** voor klanten, bewoners en hun gegevens.
- **Lokaal en vakkundig:** spreekt de taal van de Belgische makelaar, letterlijk en figuurlijk.

**Toon in de interface en berichten:** kort, concreet, vriendelijk, zonder jargon of overdreven enthousiasme. Klantberichten zijn beleefd en formeel (in het Nederlands met "u"), bijvoorbeeld "Uw bezoek is gepland" en "Via onderstaande link kunt u uw bezoek altijd wijzigen of annuleren."

## 7. Huidige visuele taal

Uit `apps/web/app/globals.css` en de designregels:

- **Bijna monochroom:** lichte achtergrond `#fafafa`, panelen wit, tekst `#171717`. Donkere modus: `#0a0a0a` / `#111111`, tekst `#ededed`.
- **Dunne randen in plaats van schaduwen** (`#ebebeb`).
- **Eén accentkleur, violet, voorbehouden aan AI** (`#7c3aed` licht, `#a78bfa` donker): alles wat een AI-agent deed of voorstelt.
- **Statuskleuren alleen als kleine bolletjes:** groen `#16a34a`, oranje `#d97706`, rood `#dc2626`, blauw `#2563eb`.
- **Lettertype:** Geist Sans en Geist Mono, compact (13px basis).
- **Iconen:** Lucide (lijniconen).
- De widget neemt de **kleur van het kantoor** over. Het kantoor is het merk voor de eindklant; Viewing blijft op de achtergrond.

Branding-aandachtspunt: violet heeft in het product een vaste betekenis ("AI"). Een merkkleur in hetzelfde violet maakt dat onderscheid zwakker. Kies je een andere merkkleur, houd violet dan als AI-signaal.

## 8. Technologie en vertrouwen (voor de website en sales)

- Next.js-webapplicatie, Postgres-database, gehost in de EU: **Vercel Frankfurt** en **Neon eu-central-1**. Alle nieuwe diensten moeten EU-hosting aanbieden.
- AI: **Claude** van Anthropic, alleen server-side, met een vaste terugvaloptie.
- E-mail via Gmail/Outlook (verzendrechten) of **Mailgun EU**. WhatsApp via de officiële **WhatsApp Business Cloud API**.
- Elk kantoor is strikt gescheiden van de andere (multi-tenant per kantoor).
- Volledige activiteitenlog: elke actie wordt als gebeurtenis bijgehouden.

## 9. Gebruikersreizen (verhalen voor de website)

**De koper op Immoweb.** Sarah vraagt zondagavond via Immoweb een bezoek aan. Binnen enkele minuten krijgt ze een antwoord in haar taal met drie vrije momenten en een link. Ze kiest dinsdag 18u, beantwoordt drie korte vragen en krijgt een bevestiging via WhatsApp. Maandagavond volgt een herinnering. De makelaar ziet het bezoek in de eigen Outlook-agenda en weet al dat Sarah een financieringsakkoord heeft. Woensdag vraagt een bericht hoe ze het bezoek vond.

**De huurder die er nog woont.** Het appartement wordt verkocht terwijl de huurder er nog woont. Hij geeft via zijn link aan: dinsdag en donderdag na 17u, niet in de krokusvakantie. Alleen die momenten worden aan kandidaten aangeboden. Hij ziet "Bezoek door Tom V., donderdag 17u30", maar geen telefoonnummer.

**Het pand gaat onder optie.** De makelaar zet het pand op "onder optie". De planner maakt voor de vijf geplande bezoekers een bericht klaar. Eén klik, en iedereen is verwittigd en de bezoeken zijn geannuleerd.

**De eigenaar die wil verkopen.** Een eigenaar klikt op "Wat is mijn woning waard?" op de site van het kantoor, beantwoordt zes vragen, bevestigt zijn gsm-nummer en ziet een vork met vergelijkbare verkopen in zijn straat. Hij boekt meteen een waarderingsbezoek. Het kantoor heeft een geverifieerde verkoperslead.

## 10. Nog niet beschikbaar (niet als bestaand verkopen)

In de interface gemarkeerd als "Coming soon", "Phase 2" of "Soon":

- **Rapporten** (Reports).
- **Automatische branding:** logo en kleuren van de website van het kantoor overnemen in de widget en berichten.
- **Pandkenmerken automatisch invullen** uit foto's, plannen en het EPC-certificaat.
- **Advertentie-tab** bij panden.
- Autonomie voor "annulaties en verplaatsingen verwerken uit antwoorden" en "lead toewijzen aan een andere makelaar" staat nu vast op "Vraag het me eerst".
- SMS als kanaal staat in het datamodel, maar is geen gekoppeld kanaal.
- Zonder `WHATSAPP_VERIFY_NUMBER` toont de waardering de verificatiecode op het scherm (demomodus).

## 11. Woordenlijst (NL ↔ product)

| In de interface (EN) | Nederlands | Betekenis |
|---|---|---|
| Listing | Pand | Te koop of te huur, statussen: concept, actief, onder optie, verkocht, verhuurd, gearchiveerd |
| Lead | Lead | Interesse van een klant in een pand of een verkoop |
| Viewing / Appointment | Bezichtiging / afspraak | Ook waarderingsbezoeken en telefoongesprekken |
| Agent | Makelaar | Medewerker met eigen agenda en werkuren |
| Planner | Planningsagent | De AI-agent die triageert, conceptantwoorden schrijft en plant |
| Proposal / Draft | Voorstel / concept | Iets wat de AI wil doen en wat op goedkeuring wacht |
| Occupant | Bewoner | Eigenaar of huurder die in het pand woont |
| Valuation | Waardering / schatting | Online schatting plus eventueel een waarderingsbezoek |
| Autonomy | Autonomie | "Doe het" of "Vraag het me eerst" |
| Widget | Widget | Script op de website van het kantoor: boeken en waarderen |
| Widget preview | Widget-preview | Salesdemo op de site van een prospect |
