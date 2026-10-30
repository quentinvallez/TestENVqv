"""One-off: shows how immodyck.be lists its listings (overviews, counts, data files), for a hand count for Quentin."""
import json, re, sys, time, urllib.request
UA = "Mozilla/5.0 (compatible; listing-count; one-off for Quentin)"
def get(u):
    time.sleep(1)
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30)
        return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), u, ""
B = "https://www.immodyck.be"
s, f, home = get(B + "/nl/")
print("home", s, f, len(home))
links = sorted(set(re.findall(r'href="([^"#]+)"', home)))
print("links", [l for l in links if not l.endswith((".css", ".js", ".png", ".ico", ".svg"))][:150])
print("robots", get(B + "/robots.txt")[2][:800])
sm = get(B + "/sitemap-index.xml")[2] or get(B + "/sitemap.xml")[2]
print("sitemap", sm[:1500])
for path in ["/page-data/nl/page-data.json", "/page-data/nl/te-koop/page-data.json", "/page-data/nl/te-huur/page-data.json", "/page-data/nl/aanbod/page-data.json"]:
    st, _, body = get(B + path)
    print("PD", path, st, len(body), body[:2500])
