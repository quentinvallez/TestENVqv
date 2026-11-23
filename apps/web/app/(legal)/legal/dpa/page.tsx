import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { cn } from "@/lib/cn";
import { dpaLangs, dpaText, toDpaLang } from "@/lib/dpa-i18n";
import { DPA_VERSION, provider } from "@/lib/legal";

export const metadata: Metadata = { title: "Unbird · DPA", robots: { index: false } };

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <>
      <dl className="mt-3 flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row[0]} className="rounded-lg border border-line p-3">
            <dt className="font-medium">{row[0]}</dt>
            {row.slice(1).map((cell, i) => (
              <dd key={i} className="mt-1 text-muted">
                {head.length > 2 && <span className="text-[12px] text-faint">{head[i + 1]}: </span>}
                {cell}
              </dd>
            ))}
          </div>
        ))}
      </dl>
      <table className="mt-3 hidden w-full border-collapse text-left md:table">
        <thead className="text-[12px] text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-line py-2 pr-3 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="align-top">
              {row.map((cell, i) => (
                <td key={i} className={cn("border-b border-line py-2 pr-3", i === 0 ? "font-medium" : "text-muted")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The data processing agreement every agency accepts when it creates its workspace, in Dutch, French and English. */
export default async function DpaPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const query = await searchParams;
  const lang = toDpaLang(query.lang ?? (await headers()).get("accept-language"));
  const t = dpaText[lang];
  const clauses = [...t.clauses, t.liability(provider.courts), t.agencyDuties];

  return (
    <article lang={lang} className="mx-auto max-w-[760px] rounded-xl border border-line bg-panel p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[20px] font-semibold tracking-tight">{t.title}</h1>
        <nav aria-label={t.languages} className="flex gap-1 text-[12px]">
          {dpaLangs.map((l) => (
            <Link key={l} href={`?lang=${l}`} className={cn("rounded px-1.5 py-0.5 uppercase", l === lang ? "bg-hover font-medium" : "text-muted hover:text-fg")}>
              {l}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mt-1 text-[12px] text-faint">{t.version(DPA_VERSION)}</p>

      <p className="mt-5 text-muted">{t.parties(provider)}</p>

      <ol className="mt-2 list-decimal pl-5">
        {clauses.map(([title, body]) => (
          <li key={title} className="mt-3">
            <span className="font-medium">{title}.</span> <span className="text-muted">{body}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-muted">{t.acceptance}</p>
      <p className="mt-2 text-[12px] text-faint">{t.prevails}</p>

      <h2 id="annex-1" className="mt-8 font-semibold">
        {t.annex1.title}
      </h2>
      <Table head={t.annex1.head} rows={t.annex1.rows} />

      <h2 id="annex-2" className="mt-8 font-semibold">
        {t.annex2.title}
      </h2>
      <p className="mt-2 text-muted">{t.annex2.intro}</p>
      <Table head={t.annex2.head} rows={t.annex2.rows} />
      <p className="mt-3 text-muted">{t.annex2.note}</p>

      <h2 id="annex-3" className="mt-8 font-semibold">
        {t.annex3.title}
      </h2>
      <Table head={t.annex3.head} rows={t.annex3.rows} />
    </article>
  );
}
