import Link from "next/link";
import { toWidgetLang } from "@/lib/widget-i18n";
import { requestPreviewAction } from "./actions";
import { RequestForm } from "./request-form";

export const dynamic = "force-dynamic";
// Reading a site and taking pictures of it can take most of a minute.
export const maxDuration = 90;

const text = {
  nl: { title: "Zie de planner op je eigen website", intro: "Vul de website van je kantoor in. We tonen onze planner op je eigen panden, in je eigen kleur. Er wordt niets op je site geplaatst." },
  fr: { title: "Voyez le planificateur sur votre propre site", intro: "Indiquez le site de votre agence. Nous montrons notre planificateur sur vos propres biens, dans votre couleur. Rien n'est placé sur votre site." },
  en: { title: "See the planner on your own website", intro: "Enter your agency's website. We show our planner on your own listings, in your colour. Nothing is put on your site." },
};

/** Public: an agency asks for a preview of the widget on its own site. */
export default async function RequestPreviewPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = toWidgetLang((await searchParams).lang);
  const t = text[lang];
  return (
    <div className="flex-1 overflow-y-auto px-4 py-10 sm:py-20">
      <div className="mx-auto max-w-[440px]">
        <div className="mb-6 flex justify-end gap-1">
          {(["nl", "fr", "en"] as const).map((code) => (
            <Link key={code} href={`/preview?lang=${code}`} className={`rounded px-1.5 py-0.5 text-[12px] uppercase ${code === lang ? "bg-hover font-medium" : "text-muted"}`}>
              {code}
            </Link>
          ))}
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-muted">{t.intro}</p>
        <div className="mt-6 rounded-lg border border-line bg-panel p-5">
          <RequestForm lang={lang} action={requestPreviewAction.bind(null, lang)} enabled={Boolean(process.env.PREVIEW_AGENCY_ID)} />
        </div>
      </div>
    </div>
  );
}
