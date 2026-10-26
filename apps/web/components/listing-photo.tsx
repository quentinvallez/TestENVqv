"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** Listing thumbnail that falls back to a neutral tile if the image fails. */
export function ListingPhoto({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-hover text-faint", className)}>
        <Building2 className="size-4" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  // No referrer: photo hosts of agency CRMs often refuse images requested from another site.
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn("object-cover", className)} />;
}
