"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { setUiLanguage } from "@/lib/i18n/actions";
import { useT } from "@/lib/i18n/client";
import { uiLangNames, uiLangs } from "@/lib/i18n";

/** The back office's language, for this login (and this browser before logging in). */
export function LanguagePicker({ className }: { className?: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={cn("flex items-center gap-1.5 text-muted", pending && "opacity-60", className)} title={t("Language")}>
      <Languages className="size-3.5 shrink-0" />
      <span className="sr-only">{t("Language")}</span>
      <select
        value={t.lang}
        disabled={pending}
        onChange={(e) => {
          const lang = e.target.value;
          start(async () => {
            await setUiLanguage(lang);
            router.refresh();
          });
        }}
        className="min-w-0 cursor-pointer bg-transparent text-[12px] outline-none hover:text-fg"
      >
        {uiLangs.map((lang) => (
          <option key={lang} value={lang}>
            {uiLangNames[lang]}
          </option>
        ))}
      </select>
    </label>
  );
}
