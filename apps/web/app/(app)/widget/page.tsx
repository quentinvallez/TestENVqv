import { CalendarDays, Code2 } from "lucide-react";
import { AiPill, PageHeader, Panel } from "@/components/ui";

const slots = ["10:00", "10:30", "11:30", "14:00", "15:30", "16:00"];

export default function WidgetPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Booking widget" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1000px] gap-6 px-5 py-6 lg:grid-cols-[1fr_360px]">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">One line of code on every listing</h1>
            <p className="mt-1 text-muted">
              The widget detects which listing the visitor is looking at, finds the responsible agent and shows their real availability from
              Google or Outlook. It takes on your agency&apos;s logo and colours automatically.
            </p>
            <Panel className="mt-5 p-4">
              <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
                <Code2 className="size-3.5" />
                Embed code
                <AiPill>Available in Phase 2</AiPill>
              </div>
              <pre className="overflow-x-auto rounded-md bg-hover p-3 font-mono text-[12px] text-muted">
                {`<script src="https://cdn.viewing.app/widget.js"\n        data-agency="your-agency" async></script>`}
              </pre>
            </Panel>
            <ul className="mt-5 flex flex-col gap-2 text-muted">
              <li>• Works on WordPress, Wix, Webflow, custom sites and CRM-generated sites</li>
              <li>• Branding detected from your website, adjustable in one click</li>
              <li>• Confirmations and reminders by email and WhatsApp</li>
            </ul>
          </div>

          <Panel className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <div className="text-[12px] text-muted">Preview</div>
              <div className="font-medium">Book a viewing · Grote Steenweg 112</div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-muted">
                <CalendarDays className="size-4" />
                Tuesday 27 October
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {slots.map((slot, i) => (
                  <div
                    key={slot}
                    className={
                      i === 1
                        ? "rounded-md border border-primary bg-primary py-2 text-center font-medium text-primary-fg"
                        : "rounded-md border border-line py-2 text-center tabular-nums"
                    }
                  >
                    {slot}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-md bg-primary py-2 text-center font-medium text-primary-fg">Confirm viewing</div>
              <p className="mt-2 text-center text-[11px] text-faint">With Sofie Peeters · confirmation via email &amp; WhatsApp</p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
