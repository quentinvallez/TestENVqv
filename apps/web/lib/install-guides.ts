/*
 * Where an agency (or its web developer) pastes the one line of widget.js, per
 * system their website is built with. The real-estate suppliers build and host
 * the site themselves, so there the step is asking them.
 */

export type InstallGuide = { id: string; name: string; who: "you" | "supplier"; steps: string[] };

const supplier = (id: string, name: string): InstallGuide => ({
  id,
  name,
  who: "supplier",
  steps: [
    `Your website is built and hosted by ${name}. Send them the line with the button above.`,
    "Ask them to add it once to the template that every page uses, just before </body>.",
    "That's all: listing pages are recognised by their address, nothing to change per listing.",
  ],
});

export const installGuides: InstallGuide[] = [
  {
    id: "wordpress",
    name: "WordPress",
    who: "you",
    steps: [
      "In WordPress, go to Plugins → Add New, search for “WPCode” and install and activate it.",
      "Open Code Snippets → Header & Footer.",
      "Paste the line in the Footer box and click Save Changes.",
      "Using a theme or page builder with its own “custom code” or “scripts” setting (Divi, Avada, Elementor Pro)? Pasting it in its footer field works too.",
    ],
  },
  {
    id: "wix",
    name: "Wix",
    who: "you",
    steps: [
      "In your Wix dashboard, open Settings → Custom code (under Advanced). It needs a premium plan and your own domain.",
      "Click + Add Custom Code and paste the line.",
      "Choose All pages, Load code once, and place it in Body - end. Click Apply.",
    ],
  },
  {
    id: "webflow",
    name: "Webflow",
    who: "you",
    steps: ["Open Site settings → Custom code.", "Paste the line in Footer code and click Save.", "Publish the site."],
  },
  {
    id: "squarespace",
    name: "Squarespace",
    who: "you",
    steps: ["Open Settings → Developer tools (or Advanced) → Code injection.", "Paste the line in the Footer box and click Save."],
  },
  {
    id: "gtm",
    name: "Google Tag Manager",
    who: "you",
    steps: [
      "Already using Google Tag Manager on your site? In your container, click New tag → Tag configuration → Custom HTML.",
      "Paste the line. Under Triggering, choose All Pages.",
      "Save, then Submit and Publish.",
    ],
  },
  supplier("whise", "Whise"),
  supplier("skarabee", "Skarabee"),
  supplier("omnicasa", "Omnicasa"),
  supplier("fortissimmo", "Fortissimmo"),
  supplier("sweepbright", "SweepBright"),
  supplier("zabun", "Zabun"),
  {
    id: "custom",
    name: "Built by a web agency or by hand",
    who: "supplier",
    steps: [
      "Send the line to whoever maintains your site with the button above.",
      "It goes once in the layout every page shares, just before </body>. Sites that change pages without reloading (Next.js, Nuxt, React) are supported.",
    ],
  },
];

/** The guide for a detected system, or the general one. */
export function guideFor(builder: string | null): InstallGuide {
  return installGuides.find((g) => g.id === builder) ?? installGuides.find((g) => g.id === "custom")!;
}

/** The email an agency sends its web developer: the line and where it goes. */
export function developerEmail(snippet: string, agencyName: string, builder: string | null): { subject: string; body: string } {
  const guide = guideFor(builder);
  return {
    subject: `Please add one line to our website (${agencyName})`,
    body: [
      "Hi,",
      "",
      "Could you add this line to our website, once, on every page (just before </body>)?",
      "",
      snippet,
      "",
      "It shows a booking button on our listing pages and a valuation button on the other pages. Listing pages are recognised automatically; nothing needs to change per listing.",
      ...(guide.who === "you" ? ["", `Our site runs on ${guide.name}:`, ...guide.steps.map((s, i) => `${i + 1}. ${s}`)] : []),
      "",
      "Thanks!",
    ].join("\n"),
  };
}
