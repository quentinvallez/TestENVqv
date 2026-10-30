"""One-off hand count of immodyck.be for Quentin: every property in the overviews' data files, and the sitemap."""
import json, re, time, urllib.request
UA = "Mozilla/5.0 (compatible; listing-count; one-off for Quentin)"
B = "https://www.immodyck.be"
def get(u):
    time.sleep(1)
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30)
    return r.read().decode("utf-8", "replace")
def lists(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, list) and v and isinstance(v[0], dict) and "SubStatusName" in v[0]: yield f"{path}.{k}", v
            else: yield from lists(v, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o): yield from lists(v, f"{path}[{i}]")
def counts(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            if re.search(r"(?i)total|count", k) and isinstance(v, (int, str)) and not isinstance(v, bool): yield f"{path}.{k}", v
            elif k != "propertiesList": yield from counts(v, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o[:50]): yield from counts(v, f"{path}[{i}]")
keep = ["ID", "Ident", "Goal", "TypeDescription", "MainTypeName", "Street", "HouseNumber", "Zip", "City", "Price", "PriceUnitText", "SubStatusName", "Marquee", "Status", "StatusName", "SubStatus", "IsSold", "IsRented", "ProjectID", "IsProject"]
for ov in ["/nl/kopen/", "/nl/huren/"]:
    d = json.loads(get(B + "/page-data" + ov + "page-data.json"))
    print("COUNTS", ov, json.dumps(list(counts(d.get("result", {})))[:40], ensure_ascii=False))
    for path, items in lists(d.get("result", {})):
        print("LIST", ov, path, len(items), "keys:", sorted(items[0].keys()))
        for p in items: print("PROP " + json.dumps({"overview": ov, **{k: p.get(k) for k in keep if k in p}}, ensure_ascii=False), flush=True)
sm = get(B + "/sitemap/sitemap-0.xml")
for u in re.findall(r"<loc>([^<]+)</loc>", sm):
    if re.search(r"/nl/(kopen|huren|project|property)", u): print("SM", u)
print("done")
