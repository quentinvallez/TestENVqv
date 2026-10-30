"""One-off count of the listings on caenen.be (Quentin, 2026-10-30): reads the site's own overviews and
listing pages directly with plain HTTP (not the import engine) and prints one JSON line per listing."""
import html as H, json, re, sys, time, urllib.parse, urllib.request

BASE = "https://www.caenen.be"
UA = "Mozilla/5.0 (compatible; listing-count; one-off for Quentin)"
LISTING = re.compile(r"^/(?:nl/)?(te-koop|te-huur)/[a-z0-9-]+-(\d{6,8})\.htm$")
BADGE = re.compile(r">\s*(Optie|In optie|Onder optie|Verkocht|Verhuurd|Onder compromis|Compromis|Nieuw|Reeds \d+% verkocht|Prijs op aanvraag)\s*<", re.I)
last = 0.0

def get(url):
    global last
    wait = 1.0 - (time.time() - last)
    if wait > 0: time.sleep(wait)
    last = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "nl"}), timeout=30)
        return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except Exception as e:
        return 0, url, str(e)

def links(page, base):
    out = []
    for m in re.finditer(r'href\s*=\s*["\']([^"\']+)["\']', page):
        u = urllib.parse.urljoin(base, H.unescape(m.group(1))).split("#")[0]
        if urllib.parse.urlparse(u).netloc.endswith("caenen.be"): out.append((u, m.start()))
    return out

def text(page):
    page = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", page)
    return [l.strip() for l in H.unescape(re.sub(r"<[^>]+>", "\n", page)).split("\n") if l.strip()]

def stated(page):
    m = re.search(r"([\d.]+)\s+resultaten", " ".join(text(page)))
    return int(m.group(1).replace(".", "")) if m else None

def overview(root):
    """Every page of one overview, following its own page links; the listings on it with the card's badge."""
    path = urllib.parse.urlparse(root).path.rstrip("/")
    queue, seen, cards, first_stated, paging = [root], set(), {}, None, set()
    while queue and len(seen) < 80:
        url = queue.pop(0)
        if url in seen: continue
        seen.add(url)
        status, final, page = get(url)
        if status != 200: print(f"!! {url} {status}"); continue
        if first_stated is None: first_stated = stated(page)
        ls = links(page, final)
        found = [(u, at) for u, at in ls if LISTING.match(urllib.parse.urlparse(u).path)]
        for i, (u, at) in enumerate(found):
            nxt = next((a for v, a in found[i + 1:] if v != u), len(page))
            badges = sorted({b.title() for b in BADGE.findall(page[at:min(nxt, at + 6000)])})
            c = cards.setdefault(u, set()); c.update(badges)
        for u, _ in ls:
            p = urllib.parse.urlparse(u)
            if p.path.rstrip("/") == path and re.search(r"(^|&)(page|p|pagina|pg|start|offset)=\d+", p.query) and u not in seen:
                paging.add(p.query); queue.append(u)
            elif re.fullmatch(re.escape(path) + r"/(pagina-?|page-?|p)?\d+", p.path.rstrip("/")) and u not in seen:
                paging.add(p.path); queue.append(u)
    print(f"OVERVIEW {json.dumps({'url': root, 'stated': first_stated, 'pages': len(seen), 'found': len(cards), 'paging': sorted(paging)[:10]})}", flush=True)
    return cards

def detail(url):
    status, final, page = get(url)
    row = {"url": url, "http": status, "final": final}
    if status != 200: return row
    t = text(page)
    title = re.search(r"(?is)<h1[^>]*>(.*?)</h1>", page)
    row["title"] = " ".join(text(title.group(1))) if title else None
    price = next((l for l in t if re.match(r"^€\s?[\d.]+", l)), None)
    row["price"] = price
    row["badges"] = sorted({l.title() for l in t if BADGE.fullmatch(">" + l + "<")})
    row["status_lines"] = [l for l in t if re.search(r"\b(verkocht|verhuurd|optie|compromis)\b", l, re.I) and len(l) < 60][:8]
    og = re.search(r'property="og:title"\s+content="([^"]+)"', page)
    row["og_title"] = H.unescape(og.group(1)) if og else None
    return row

def main():
    status, final, home = get(BASE + "/nl")
    print(f"home {status} {final} {len(home)} chars")
    roots = {BASE + "/nl/te-koop", BASE + "/nl/te-huur", BASE + "/nl/nieuwbouw"}
    for u, _ in links(home, final):
        p = urllib.parse.urlparse(u).path
        if re.search(r"verkocht|verhuurd|referentie|te-koop|te-huur|nieuwbouw|aanbod|optie", p) and not LISTING.match(p) and p.count("/") <= 2:
            roots.add(u.split("?")[0])
    print("roots", sorted(roots), flush=True)
    shown = {}
    for root in sorted(roots):
        for u, badges in overview(root).items():
            s = shown.setdefault(u, {"overviews": set(), "card": set()})
            s["overviews"].add(urllib.parse.urlparse(root).path); s["card"].update(badges)
    # A sample card's markup, to check the badge reading.
    print(f"listing pages: {len(shown)}", flush=True)
    for u, s in shown.items():
        row = detail(u)
        row["overviews"] = sorted(s["overviews"]); row["card_badges"] = sorted(s["card"])
        print("LISTING " + json.dumps(row, ensure_ascii=False), flush=True)
    print("done")

main()
