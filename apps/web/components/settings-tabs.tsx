import { Tabs } from "./ui";

/** Settings and "Website & widget" share one menu entry; these tabs switch between them. */
export function SettingsTabs({ active }: { active: "general" | "widget" }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { id: "general", label: "General", href: "/settings" },
        { id: "widget", label: "Website & widget", href: "/widget" },
      ]}
    />
  );
}
