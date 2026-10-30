"""One-off hand count of immodyck.be for Quentin: overviews' data files, the sitemap, and every listing's data file."""
import json, re, time, urllib.request
UA = "Mozilla/5.0 (compatible; listing-count; one-off for Quentin)"
B = "https://www.immodyck.be"
def get(u):
    time.sleep(1)
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30)
        return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), ""
def pd(path):
    st, body = get(B + "/page-data" + path.rstrip("/") + "/page-data.json")
    try: return json.loads(body)
    except Exception: return None
def walk(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items(): yield from walk(v, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o[:3]): yield from walk(v, f"{path}[{i}]")
    else: yield path, o
for ov in ["/nl/kopen/", "/nl/huren/"]:
    d = pd(ov)
    print("OVPD", ov, "none" if d is None else json.dumps(d)[:200])
    if d:
        for p, v in walk(d.get("result", {})):
            if re.search(r"(?i)total|count|status|sold|option|propert|goal|purpose", p) and not isinstance(v, str) or (isinstance(v, str) and len(v) < 80 and re.search(r"(?i)total|count|status|propert", p)):
                print("  ", p, repr(v)[:100])
st, sm = get(B + "/sitemap/sitemap-0.xml")
urls = re.findall(r"<loc>([^<]+)</loc>", sm)
print("SITEMAP", st, len(urls))
from collections import Counter
print(Counter("/".join(u.replace(B, "").split("/")[:3]) for u in urls))
nl = [u for u in urls if re.search(r"/nl/[^/]+/.+", u.replace(B, ""))]
print("nl deep", len(nl), nl[:10])
first = True
for u in nl:
    path = u.replace(B, "")
    d = pd(path)
    if not d: print("LPD", json.dumps({"url": u, "error": True})); continue
    ctx = d.get("result", {}).get("pageContext", {})
    if first:
        print("FIRST", json.dumps(ctx)[:6000]); first = False
    flat = {p: v for p, v in walk(ctx) if re.search(r"(?i)status|sold|option|price|city|ident|reference|goal|purpose|type|marquee|label|zip|street", p.split(".")[-1]) and not isinstance(v, (dict, list))}
    print("LPD " + json.dumps({"url": u, "fields": dict(list(flat.items())[:60])}, ensure_ascii=False), flush=True)
print("done")
