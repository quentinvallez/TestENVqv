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
 */
const script = String.raw`(function () {
  var current = document.currentScript;
  if (!current) return;
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

  function start() {
    document.querySelectorAll("[data-viewing-widget]").forEach(mount);
    document.querySelectorAll("[data-viewing-valuation]").forEach(mountValuation);
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
