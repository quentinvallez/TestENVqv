import { Tabs } from "./ui";

/** Settings, "Website & widget" and "Booking questions" share one menu entry; these tabs switch between them. */
export function SettingsTabs({ active }: { active: "general" | "widget" | "questions" }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { id: "general", label: "General", href: "/settings" },
        { id: "widget", label: "Website & widget", href: "/widget" },
        { id: "questions", label: "Booking questions", href: "/settings/questions" },
      ]}
    />
  );
}
