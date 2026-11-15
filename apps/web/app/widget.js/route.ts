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
 * in the background and have the button from the next visit. On single-page
 * sites the button follows the address as the visitor moves between pages.
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


  // The site's own look, read from the page, so the widget blends in: page
  // background and text colour, its font, and the colour of its own buttons
  // (used when the agency hasn't set a brand colour in the back office).
  function rgb(value) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(value || "");
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  function hex(c) {
    return "#" + c.map(function (n) { return ("0" + n.toString(16)).slice(-2); }).join("");
  }
  function lum(c) {
    var v = c.map(function (n) { n /= 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // The file of a web font the site loads itself (from a stylesheet we may read),
  // so the widget can use the same font; fonts don't cross into an iframe.
  function fontFile(stack) {
    var family = (stack || "").split(",")[0].replace(/["']/g, "").trim().toLowerCase();
    if (!family) return "";
    var found = "";
    for (var i = 0; i < document.styleSheets.length && !found; i++) {
      var sheet = document.styleSheets[i];
      var rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (var j = 0; rules && j < rules.length && !found; j++) {
        var rule = rules[j];
        if (rule.type !== 5) continue;
        if (rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim().toLowerCase() !== family) continue;
        var weight = rule.style.getPropertyValue("font-weight");
        if (weight && !/^(400|normal|\d+ \d+)$/.test(weight.trim())) continue;
        var m = /url\(\s*["']?([^"')]+\.woff2?[^"')]*)["']?\s*\)/.exec(rule.style.getPropertyValue("src"));
        if (m) found = new URL(m[1], sheet.href || location.href).href;
      }
    }
    return /^https:\/\//.test(found) ? found : "";
  }
  var siteLook = null;
  function readLook() {
    if (siteLook) return siteLook;
    var body = getComputedStyle(document.body);
    var bg = rgb(body.backgroundColor) || rgb(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255];
    var fg = rgb(body.color) || [17, 17, 17];
    var counts = {};
    var best = null;
    var els = document.querySelectorAll("button, a[class*=btn], a[class*=button], a[class*=cta], [class*=badge], [class*=label], [class*=tag], [role=button], input[type=submit]");
    for (var i = 0; i < els.length && i < 400; i++) {
      var c = rgb(getComputedStyle(els[i]).backgroundColor);
      if (!c || contrast(c, bg) < 2.5) continue;
      var key = hex(c);
      counts[key] = (counts[key] || 0) + 1;
      if (!best || counts[key] > counts[best]) best = key;
    }
    var heading = document.querySelector("h1, h2");
    var headingFont = heading ? getComputedStyle(heading).fontFamily : "";
    siteLook = {
      bg: hex(bg),
      fg: hex(fg),
      brand: best,
      font: body.fontFamily,
      heading: headingFont,
      fontSrc: fontFile(body.fontFamily),
      headingSrc: headingFont ? fontFile(headingFont) : "",
      dark: lum(bg) < 0.25,
    };
    return siteLook;
  }
  function lookQuery(config) {
    var l = readLook();
    var brand = config && /^#[0-9a-f]{3,8}$/i.test(config.brand || "") ? config.brand : l.brand;
    return "&bg=" + encodeURIComponent(l.bg) + "&fg=" + encodeURIComponent(l.fg) + (brand ? "&brand=" + encodeURIComponent(brand) : "") +
      "&font=" + encodeURIComponent(l.font.slice(0, 120)) + (l.heading ? "&hfont=" + encodeURIComponent(l.heading.slice(0, 120)) : "") +
      (l.fontSrc ? "&fontsrc=" + encodeURIComponent(l.fontSrc) : "") + (l.headingSrc ? "&hfontsrc=" + encodeURIComponent(l.headingSrc) : "");
  }

  function mount(container) {
    var reference = container.getAttribute("data-listing");
    var lang = (container.getAttribute("data-lang") || document.documentElement.lang || "en").slice(0, 2);
    if (!agency || !reference) return;
    fetch(origin + "/api/widget/resolve?agency=" + encodeURIComponent(agency) + "&ref=" + encodeURIComponent(reference))
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (!data.listingId) return;
        var agent = detectAgent(data.agents || [], container);
        var iframe = document.createElement("iframe");
        iframe.src = origin + "/embed/" + data.listingId + "?lang=" + lang + (agent ? "&agent=" + agent.id : "") + lookQuery(data);
        iframe.title = "Booking";
        iframe.style.cssText = "width:100%;border:0;height:560px;display:block;background:transparent";
        container.setAttribute("data-viewing-agent", agent ? agent.name : "");
        window.addEventListener("message", function (event) {
          if (event.source === iframe.contentWindow && event.data && event.data.type === "viewing-widget-height") {
            iframe.style.height = Math.max(240, Number(event.data.height)) + "px";
          }
        });
        container.appendChild(iframe);
        if (wantsBooking()) container.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(function () {});
  }
  // "See on website" in the back office opens the listing page at #viewing-booking:
  // scroll to the calendar, or open the floating booking panel.
  function wantsBooking() {
    return location.hash === "#viewing-booking";
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
    var lang = (container.getAttribute("data-lang") || document.documentElement.lang || "en").slice(0, 2);
    if (agency) frame(container, origin + "/embed/valuation?agency=" + encodeURIComponent(agency) + "&lang=" + lang + lookQuery(siteConfig));
  }

  function pageLang() {
    var scope = current.closest("[lang]");
    return (current.getAttribute("data-lang") || (scope && scope.lang) || document.documentElement.lang || "en").slice(0, 2);
  }

  // Floating button at the bottom right, in the agency's colour: the valuation
  // on every page, or "book a viewing" on listing pages found on the website.
  var launcherHost = null;
  var bookingPage = false;
  var houseIcon = '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>';
  var calendarIcon = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>';
  function launcher(config, options) {
    var look = readLook();
    var brand = /^#[0-9a-f]{3,8}$/i.test(config.brand || "") ? config.brand : look.brand || "#111111";
    var brandRgb = rgb(brand.length === 7 ? "rgb(" + parseInt(brand.slice(1, 3), 16) + "," + parseInt(brand.slice(3, 5), 16) + "," + parseInt(brand.slice(5, 7), 16) + ")" : "") || [17, 17, 17];
    var onBrand = contrast(brandRgb, [255, 255, 255]) >= contrast(brandRgb, [17, 17, 17]) ? "#ffffff" : "#111111";
    var font = (look.font || "system-ui,sans-serif").replace(/[<>{};]/g, "");
    var host = document.createElement("div");
    host.setAttribute("data-viewing-launcher", "");
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      ".open{position:fixed;z-index:2147483000;right:20px;bottom:20px;display:flex;align-items:center;gap:10px;height:54px;padding:0 22px 0 18px;border:0;border-radius:999px;background:" + brand + ";color:" + onBrand + ";font-weight:600;font-size:16px;line-height:1;font-family:" + font + ";box-shadow:0 6px 24px rgba(0,0,0,.2);cursor:pointer}" +
      ".open:focus-visible,.close:focus-visible{outline:2px solid " + brand + ";outline-offset:2px}" +
      ".open svg{width:20px;height:20px;flex:none}" +
      ".panel{position:fixed;z-index:2147483001;right:24px;bottom:24px;width:540px;max-width:calc(100vw - 48px);height:min(880px,calc(100vh - 48px));display:flex;flex-direction:column;overflow:hidden;border-radius:16px;color-scheme:" + (look.dark ? "dark" : "light") + ";background:" + look.bg + ";color:" + look.fg + ";box-shadow:0 16px 56px rgba(0,0,0,.3)}" +
      ".panel[hidden],.open[hidden]{display:none}" +
      ".bar{display:flex;align-items:center;justify-content:space-between;gap:8px;height:56px;padding:0 10px 0 20px;border-bottom:1px solid rgba(127,127,127,.25);font-weight:600;font-size:16px;line-height:1.2;font-family:" + (look.heading || font).replace(/[<>{};]/g, "") + "}" +
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
        iframe.src = options.src + lookQuery(config) + "&panel=1";
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
    if (options.booking && wantsBooking()) show();
  }
  function valuationLauncher(config) {
    if (!config || !config.valuationLauncher || bookingPage || current.getAttribute("data-launcher") === "off") return;
    launcher(config, { label: config.text.launcher, title: config.text.title, icon: houseIcon, src: origin + "/embed/valuation?agency=" + encodeURIComponent(agency) + "&lang=" + pageLang() });
  }
  // A listing page of the agency's site without a placeholder: we know it from
  // the listing import (or read it now, for the next visit) and offer booking.
  function pageUrl() {
    return location.href.split("#")[0];
  }
  var siteConfig = null;
  var launchedFor = null;
  function bookingLauncher(config) {
    siteConfig = config;
    var page = (launchedFor = pageUrl());
    if (!config || !config.bookingLauncher || current.getAttribute("data-launcher") === "off" || document.querySelector("[data-viewing-widget]")) return valuationLauncher(config);
    fetch(origin + "/api/widget/page?agency=" + encodeURIComponent(agency) + "&url=" + encodeURIComponent(page))
      .then(function (response) { return response.ok ? response.json() : {}; })
      .then(function (data) {
        // The visitor moved on to another page while we asked (single-page sites).
        if (page !== pageUrl()) return;
        if (!data.listingId || document.querySelector("[data-viewing-widget]")) return valuationLauncher(config);
        bookingPage = true;
        var agent = detectAgent(data.agents || [], document.createElement("div"));
        launcher(config, {
          label: config.text.booking,
          title: config.text.booking,
          icon: calendarIcon,
          booking: true,
          src: origin + "/embed/" + data.listingId + "?lang=" + pageLang() + (agent ? "&agent=" + agent.id : ""),
        });
      })
      .catch(function () { if (page === pageUrl()) valuationLauncher(config); });
  }
  // Sites built as single-page apps (Next.js, Nuxt, React...) change the address
  // without loading a new page: decide again which button the new page gets.
  function followNavigation() {
    if (!launchedFor || launchedFor === pageUrl()) return;
    if (launcherHost) launcherHost.parentNode.removeChild(launcherHost);
    launcherHost = null;
    bookingPage = false;
    bookingLauncher(siteConfig);
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
      fetch(origin + "/api/widget/config?agency=" + encodeURIComponent(agency) + "&lang=" + pageLang() + "&page=" + encodeURIComponent(location.origin + location.pathname))
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(bookingLauncher)
        .catch(function () {});
    }
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; scan(); followNavigation(); }, 200);
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", function () { setTimeout(followNavigation, 200); });
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
