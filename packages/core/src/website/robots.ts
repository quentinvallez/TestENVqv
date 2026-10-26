/*
 * robots.txt, as search engines read it (RFC 9309): the group for our
 * user-agent if the site has one, else the "*" group; the longest matching
 * rule wins and Allow wins a tie; "*" and "$" work as wildcards. Crawl-delay
 * isn't in the RFC but sites use it, so we honour it too.
 */

export const ROBOTS_AGENT = "ViewingBot";

export type RobotsPolicy = {
  allowed: (url: string) => boolean;
  /** Seconds the site asks crawlers to wait between requests, if it says. */
  crawlDelay: number | null;
  sitemaps: string[];
};

type Rule = { allow: boolean; pattern: string };
type Group = { agents: string[]; rules: Rule[]; crawlDelay: number | null };

export const allowAll: RobotsPolicy = { allowed: () => true, crawlDelay: null, sitemaps: [] };
export const disallowAll: RobotsPolicy = { allowed: () => false, crawlDelay: null, sitemaps: [] };

function matches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(`^${body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
  return re.test(path);
}

export function parseRobots(text: string, agent = ROBOTS_AGENT): RobotsPolicy {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      // Consecutive user-agent lines share one group.
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [], crawlDelay: null }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      // An empty Disallow allows everything; it adds no rule.
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
    }
  }

  const name = agent.toLowerCase();
  const own = groups.filter((g) => g.agents.some((a) => a === name));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const delays = chosen.map((g) => g.crawlDelay).filter((d): d is number => d != null);

  return {
    sitemaps,
    crawlDelay: delays.length ? Math.max(...delays) : null,
    allowed: (url: string) => {
      let path: string;
      try {
        const parsed = new URL(url);
        path = decodeURIComponent(parsed.pathname) + parsed.search;
      } catch {
        return false;
      }
      let best: Rule | null = null;
      for (const rule of rules) {
        const pattern = safeDecode(rule.pattern);
        if (!matches(pattern, path)) continue;
        if (!best || pattern.length > safeDecode(best.pattern).length || (pattern.length === safeDecode(best.pattern).length && rule.allow)) best = rule;
      }
      return !best || best.allow;
    },
  };
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
