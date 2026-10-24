import { Mail, MessageCircle, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/cn";

export const providerMeta = {
  outlook: { label: "Outlook", color: "#0f6cbd", icon: Mail },
  gmail: { label: "Gmail", color: "#d93025", icon: Mail },
  whatsapp_business: { label: "WhatsApp", color: "#1fa855", icon: MessageCircle },
  sms: { label: "SMS", color: "#6b7280", icon: MessageSquareText },
} as const;

export type Provider = keyof typeof providerMeta;

export function providerOf(provider: string | null | undefined, channel: string): Provider {
  if (provider && provider in providerMeta) return provider as Provider;
  return channel === "whatsapp" ? "whatsapp_business" : channel === "sms" ? "sms" : "outlook";
}

/** Small square mark for the channel a conversation lives in. */
export function ChannelMark({ provider, size = 16, className }: { provider: Provider; size?: number; className?: string }) {
  const meta = providerMeta[provider];
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      className={cn("inline-flex shrink-0 items-center justify-center rounded text-white", className)}
      style={{ width: size, height: size, background: meta.color }}
    >
      <Icon style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={2.25} />
    </span>
  );
}
