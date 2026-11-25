import { LanguagePicker } from "@/components/language-picker";
import { I18nProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <I18nProvider lang={lang}>
    <div lang={lang} className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-fg">V</span>
          <span className="text-[15px] font-semibold tracking-tight">Viewing</span>
        </div>
        {children}
        <LanguagePicker className="mt-8 justify-center" />
      </div>
    </div>
    </I18nProvider>
  );
}
