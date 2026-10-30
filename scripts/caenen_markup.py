"""One-off: prints the markup around status badges on caenen.be, to read card and page statuses correctly."""
import re, time, urllib.request
UA = "Mozilla/5.0 (compatible; listing-count; one-off for Quentin)"
def get(u):
    time.sleep(1)
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30).read().decode("utf-8", "replace")
def squash(s): return re.sub(r"\s+", " ", re.sub(r'(?s)(data-flickity-options|style|srcset|data-srcset)="[^"]*"', "", s))
def around(page, word, n, before=1500, after=400):
    for m in list(re.finditer(r">\s*" + word + r"\s*<", page))[:n]:
        print(f"--- {word} at {m.start()}:\n{squash(page[max(0, m.start()-before):m.start()+after])}\n")
p = get("https://www.caenen.be/nl/te-koop")
print("te-koop badge counts:", {w: len(re.findall(r">\s*" + w + r"\s*<", p)) for w in ["Verkocht", "Optie", "Nieuw", "Verhuurd", "In optie"]})
around(p, "Verkocht", 2); around(p, "Optie", 1)
p = get("https://www.caenen.be/nl/recent-verkocht")
print("recent-verkocht badge counts:", {w: len(re.findall(r">\s*" + w + r"\s*<", p)) for w in ["Verkocht", "Verhuurd", "Optie"]})
print("hrefs:", sorted(set(re.findall(r'href="([^"]+)"', p)))[:400])
print("paging hints:", sorted(set(re.findall(r'(?i)(?:data-[a-z-]*page[a-z-]*|load-?more|meer laden|volgende|ajax[^"\' ]*|/api/[^"\' ]+|page=\d+)', p)))[:40])
around(p, "Verkocht", 2, 2500, 600)
i = p.find("resultaten"); print("--- around resultaten:", squash(p[i-500:i+3000]))
d = get("https://www.caenen.be/nl/te-koop/studio-middelkerke-wimbledon-c-4493050.htm")
around(d, "Optie", 4, 800, 300)
d = get("https://www.caenen.be/nl/te-koop/appartement-nieuwpoort-residentie-apollo-viii-4478354.htm")
around(d, "Verkocht", 4, 800, 300)
