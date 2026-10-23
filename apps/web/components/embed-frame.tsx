"use client";

import { useEffect, useRef, useState } from "react";

/** Iframe that grows with the widget inside it, as the embed script will do on real sites. */
export function EmbedFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(560);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && e.data?.type === "viewing-widget-height") setHeight(Math.max(240, Number(e.data.height)));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return <iframe ref={ref} src={src} title={title} style={{ height }} className="w-full border-0 bg-white" />;
}
