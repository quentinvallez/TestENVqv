"""One-off count of the listings on caenen.be (Quentin, 2026-10-30): reads the site's own overviews and
listing pages directly with plain HTTP (not the import engine) and prints one JSON line per card and page."""
import html as H, json, re, time, urllib.request

BASE = "https://www.caenen.be/nl"
UA = "Mozilla/5.0 (compatible; listing-count; one-off for Quentin)"
BANNER = re.compile(r'rounded-end text-white fw-bolder bg-info">\s*([^<]+?)\s*</div>')
last = 0.0

def get(url):
    global last
    time.sleep(max(0, 1.0 - (time.time() - last)))
    last = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30)
        return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, url, ""

def clean(s): return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip() or None
def first(rx, s): m = re.search(rx, s, re.S); return clean(m.group(1)) if m else None

def cards(page):
    out = []
    for chunk in re.split(r'<div class="col-12[^"]*properties-overview"', page)[1:]:
        out.append({
            "url": first(r'href="(https://www\.caenen\.be/nl/te-(?:koop|huur)/[^"]+\.htm)"', chunk),
            "ref": first(r'text-end text-muted fs-6">\s*(\d+)', chunk),
            "label": first(r'fs-5">\s*(Te koop|Te huur|[^<]{1,30})</p>', chunk),
            "type": first(r'<p class="mb-0 h3">(.*?)</p>', chunk),
            "city": first(r'<p class="h3">\s*<strong>(.*?)</strong>', chunk),
            "name": first(r'<p class="text-primary fs-6">(.*?)</p>', chunk),
            "banner": first(BANNER.pattern, chunk),
            "price": first(r'fa-coins[^>]*></i>(.*?)</div>', chunk),
        })
    return out

def overview(name, url):
    status, final, page = get(url)
    stated = first(r"<strong>\s*([\d.]+) resultaten", page)
    found = cards(page)
    pages = 1
    for nxt in sorted(set(re.findall(r'href="([^"]*d_page=\d+[^"]*)"', page))):
        _, _, p = get(H.unescape(nxt)); pages += 1; found += cards(p)
    print("OVERVIEW " + json.dumps({"name": name, "url": url, "stated": stated, "pages": pages, "cards": len(found)}), flush=True)
    for c in found: print("CARD " + json.dumps({"overview": name, **c}, ensure_ascii=False), flush=True)
    return found

def main():
    shown = {}
    for name, url in [("te-koop", f"{BASE}/te-koop"), ("te-huur", f"{BASE}/te-huur"), ("nieuwbouw", f"{BASE}/nieuwbouw"), ("recent-verkocht", f"{BASE}/recent-verkocht")]:
        for c in overview(name, url):
            if name != "recent-verkocht" and c["url"]: shown.setdefault(c["url"], set()).add(name)
    for url, names in shown.items():
        status, final, page = get(url)
        head = page.split("properties-overview")[0]  # the listing itself, before any similar-listing cards
        row = {"url": url, "overviews": sorted(names), "http": status, "final": final,
               "banner": first(BANNER.pattern, head),
               "og_title": first(r'property="og:title"\s+content="([^"]+)"', page),
               "units_sold_note": first(r">\s*(Reeds \d+% verkocht)\s*<", head)}
        print("PAGE " + json.dumps(row, ensure_ascii=False), flush=True)
    print("done")

main()
