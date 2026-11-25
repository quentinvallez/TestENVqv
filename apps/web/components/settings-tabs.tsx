import { getT } from "@/lib/i18n/server";
import { Tabs } from "./ui";

/** Settings, "Website & widget" and "Booking questions" share one menu entry; these tabs switch between them. */
export async function SettingsTabs({ active }: { active: "general" | "widget" | "questions" }) {
  const t = await getT();
  return (
    <Tabs
      active={active}
      tabs={[
        { id: "general", label: t("General"), href: "/settings" },
        { id: "widget", label: t("Website & widget"), href: "/widget" },
        { id: "questions", label: t("Booking questions"), href: "/settings/questions" },
      ]}
    />
  );
}
