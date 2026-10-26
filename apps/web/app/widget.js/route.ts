/*
 * The embed script agencies put on their website:
 *
 *   <div data-viewing-widget data-listing="ANT-1042"></div>
 *   <script src="https://<app>/widget.js" data-agency="<agency id>" async></script>
 *
 * It looks for the name of one of the agency's agents on the page (the first
 * one that appears outside the widget) and loads the booking widget for that
 * agent. Without a match it falls back to the listing's responsible agent.
 *
 * The same script loads the home valuation for owners wherever the page has
 *
 *   <div data-viewing-valuation></div>
 *
 * and, on every other page, a floating "free valuation" button at the bottom
 * right that opens it in a panel (full screen on phones). Agencies turn the
 * button off in the back office, or per page with data-launcher="off" on the
 * script tag. Placeholders added later (single-page sites) are picked up too.
 *
 * Without any placeholder, a listing page of the agency's website that the
 * listing import knows gets a floating "book a viewing" button instead, so the
 * agency only has to paste the script tag. Pages it doesn't know yet are read
 * in the background and have the button from the next visit.
 */
const script = String.raw`(function () {
  var current = document.currentScript;
  if (!current || window.__viewingWidget) return;
  window.__viewingWidget = true;
  var origin = new URL(current.src).origin;
  var agency = current.getAttribute("data-agency");

  function normalise(text) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").toLowerCase();
  }

  function pageText(exclude) {
    var parts = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || exclude.contains(parent) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    return normalise(parts.join(" "));
  }

  function detectAgent(agents, container) {
    var text = pageText(container);
    var best = null;
    agents.forEach(function (agent) {
      var at = text.indexOf(normalise(agent.name));
      if (at >= 0 && (!best || at < best.at)) best = { id: agent.id, name: agent.name, at: at };
    });
    return best;
  }

  function mount(container) {
    var reference = container.getAttribute("data-listing");
    var lang = (container.getAttribute("data-lang") || document.documentElement.lang || "nl").slice(0, 2);
    if (!agency || !reference) return;
    fetch(origin + "/api/widget/resolve?agency=" + encodeURIComponent(agency) + "&ref=" + encodeURIComponent(reference))
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (!data.listingId) return;
        var agent = detectAgent(data.agents || [], container);
        var iframe = document.createElement("iframe");
        iframe.src = origin + "/embed/" + data.listingId + "?lang=" + lang + (agent ? "&agent=" + agent.id : "");
        iframe.title = "Booking";
        iframe.style.cssText = "width:100%;border:0;height:560px;display:block;background:transparent";
        container.setAttribute("data-viewing-agent", agent ? agent.name : "");
        window.addEventListener("message", function (event) {
          if (event.source === iframe.contentWindow && event.data && event.data.type === "viewing-widget-height") {
            iframe.style.height = Math.max(240, Number(event.data.height)) + "px";
          }
        });
        container.appendChild(iframe);
      })
      .catch(function () {});
  }

  function frame(container, src) {
    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "Widget";
    iframe.style.cssText = "width:100%;border:0;height:560px;display:block;background:transparent";
    window.addEventListener("message", function (event) {
      if (event.source === iframe.contentWindow && event.data && event.data.type === "viewing-widget-height") {
        iframe.style.height = Math.max(240, Number(event.data.height)) + "px";
      }
    });
    container.appendChild(iframe);
  }

  // Home valuation for owners: <div data-viewing-valuation></div>
  function mountValuation(container) {
    var lang = (container.getAttribute("data-lang") || document.documentElement.lang || "nl").slice(0, 2);
    if (agency) frame(container, origin + "/embed/valuation?agency=" + encodeURIComponent(agency) + "&lang=" + lang);
  }

  function pageLang() {
    var scope = current.closest("[lang]");
    return (current.getAttribute("data-lang") || (scope && scope.lang) || document.documentElement.lang || "nl").slice(0, 2);
  }

  // Floating button at the bottom right, in the agency's colour: the valuation
  // on every page, or "book a viewing" on listing pages found on the website.
  var launcherHost = null;
  var bookingPage = false;
  var houseIcon = '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>';
  var calendarIcon = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>';
  function launcher(config, options) {
    var brand = /^#[0-9a-f]{3,8}$/i.test(config.brand || "") ? config.brand : "#111111";
    var host = document.createElement("div");
    host.setAttribute("data-viewing-launcher", "");
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      ".open{position:fixed;z-index:2147483000;right:20px;bottom:20px;display:flex;align-items:center;gap:8px;height:48px;padding:0 18px 0 14px;border:0;border-radius:999px;background:" + brand + ";color:#fff;font:600 15px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.2);cursor:pointer}" +
      ".open:focus-visible,.close:focus-visible{outline:2px solid " + brand + ";outline-offset:2px}" +
      ".open svg{width:20px;height:20px;flex:none}" +
      ".panel{position:fixed;z-index:2147483001;right:20px;bottom:20px;width:420px;max-width:calc(100vw - 40px);height:min(720px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;border-radius:14px;color-scheme:light dark;background:Canvas;color:CanvasText;box-shadow:0 12px 48px rgba(0,0,0,.28)}" +
      ".panel[hidden],.open[hidden]{display:none}" +
      ".bar{display:flex;align-items:center;justify-content:space-between;gap:8px;height:48px;padding:0 8px 0 16px;border-bottom:1px solid rgba(127,127,127,.25);font:600 14px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".close{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:8px;background:transparent;color:inherit;font:400 24px/1 system-ui,sans-serif;cursor:pointer}" +
      "iframe{flex:1;width:100%;border:0;background:transparent}" +
      "@media (max-width:560px){.open{right:16px;bottom:16px}.panel{inset:0;width:auto;max-width:none;height:100%;border-radius:0}}" +
      "</style>" +
      '<button class="open" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + options.icon + '</svg><span></span></button>' +
      '<div class="panel" role="dialog" aria-modal="true" hidden><div class="bar"><span></span><button class="close" type="button">×</button></div></div>';
    var open = root.querySelector(".open");
    var panel = root.querySelector(".panel");
    var close = root.querySelector(".close");
    open.querySelector("span").textContent = options.label;
    panel.querySelector(".bar span").textContent = options.label;
    panel.setAttribute("aria-label", options.title);
    close.setAttribute("aria-label", config.text.close);
    var iframe = null;
    function show() {
      if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.title = options.title;
        iframe.src = options.src;
        panel.appendChild(iframe);
      }
      panel.hidden = false;
      open.hidden = true;
      close.focus();
    }
    function hide() {
      panel.hidden = true;
      open.hidden = false;
      open.focus();
    }
    open.addEventListener("click", show);
    close.addEventListener("click", hide);
    root.addEventListener("keydown", function (event) { if (event.key === "Escape") hide(); });
    if (launcherHost) launcherHost.parentNode.removeChild(launcherHost);
    document.body.appendChild(host);
    launcherHost = host;
    refreshLauncher();
  }
  function valuationLauncher(config) {
    if (!config || !config.valuationLauncher || bookingPage || current.getAttribute("data-launcher") === "off") return;
    launcher(config, { label: config.text.launcher, title: config.text.title, icon: houseIcon, src: origin + "/embed/valuation?agency=" + encodeURIComponent(agency) + "&lang=" + pageLang() });
  }
  // A listing page of the agency's site without a placeholder: we know it from
  // the listing import (or read it now, for the next visit) and offer booking.
  function bookingLauncher(config) {
    if (!config || !config.bookingLauncher || current.getAttribute("data-launcher") === "off" || document.querySelector("[data-viewing-widget]")) return valuationLauncher(config);
    fetch(origin + "/api/widget/page?agency=" + encodeURIComponent(agency) + "&url=" + encodeURIComponent(location.href.split("#")[0]))
      .then(function (response) { return response.ok ? response.json() : {}; })
      .then(function (data) {
        if (!data.listingId || document.querySelector("[data-viewing-widget]")) return valuationLauncher(config);
        bookingPage = true;
        var agent = detectAgent(data.agents || [], document.createElement("div"));
        launcher(config, {
          label: config.text.booking,
          title: config.text.booking,
          icon: calendarIcon,
          src: origin + "/embed/" + data.listingId + "?lang=" + pageLang() + (agent ? "&agent=" + agent.id : ""),
        });
      })
      .catch(function () { valuationLauncher(config); });
  }
  // Not on a page that already shows the valuation (or the booking) itself.
  function refreshLauncher() {
    if (!launcherHost) return;
    var inline = bookingPage ? document.querySelector("[data-viewing-widget]") : document.querySelector("[data-viewing-valuation]");
    launcherHost.style.display = inline ? "none" : "";
  }

  function scan() {
    document.querySelectorAll("[data-viewing-widget]:not([data-viewing-mounted])").forEach(function (el) { el.setAttribute("data-viewing-mounted", ""); mount(el); });
    document.querySelectorAll("[data-viewing-valuation]:not([data-viewing-mounted])").forEach(function (el) { el.setAttribute("data-viewing-mounted", ""); mountValuation(el); });
    refreshLauncher();
  }

  function start() {
    scan();
    if (agency) {
      fetch(origin + "/api/widget/config?agency=" + encodeURIComponent(agency) + "&lang=" + pageLang())
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(bookingLauncher)
        .catch(function () {});
    }
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; scan(); }, 200);
    }).observe(document.body, { childList: true, subtree: true });
  }
  // The script may run before the page body is parsed (async, or placed in <head>).
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();`;

export function GET() {
  return new Response(script, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
