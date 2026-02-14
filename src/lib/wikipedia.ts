import { ArticleSnapshot } from "./types";
import { unique } from "./utils";

const WIKI_API = "https://ja.wikipedia.org/w/api.php";
const ARTICLE_CACHE_MS = 10 * 60 * 1000;
const BACKLINK_CACHE_MS = 5 * 60 * 1000;
const EDGE_CACHE_MS = 5 * 60 * 1000;
const TITLE_CACHE_MS = 30 * 60 * 1000;
const GOAL_POOL_CACHE_MS = 6 * 60 * 60 * 1000;
const ALL_PAGES_BATCH_LIMIT = 500;
const WIKI_TIMEOUT_MS = 12_000;
const WIKI_MAX_RETRIES = 4;
const WIKI_MIN_INTERVAL_MS = 180;
const WIKI_MAX_RETRY_WAIT_MS = 10_000;
const WIKI_RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const WIKI_API_USER_AGENT =
  typeof process !== "undefined" && process.env.WIKI_API_USER_AGENT?.trim()
    ? process.env.WIKI_API_USER_AGENT.trim()
    : "wikipedia-game/0.1 (self-hosted wiki link race)";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface WikiRateGate {
  nextAt: number;
  blockedUntil: number;
}

interface RandomResponse {
  query?: {
    random?: Array<{
      title?: string;
    }>;
  };
}

interface BacklinksResponse {
  query?: {
    backlinks?: Array<{
      title: string;
    }>;
  };
  continue?: {
    blcontinue?: string;
  };
}

interface ArticleResponse {
  query?: {
    pages?: Array<{
      title: string;
      extract?: string;
      links?: Array<{
        title: string;
      }>;
      missing?: boolean;
    }>;
  };
  continue?: {
    plcontinue?: string;
  };
}

interface TitleResponse {
  query?: {
    pages?: Array<{
      title: string;
      missing?: boolean;
    }>;
  };
}

interface AllPagesResponse {
  query?: {
    allpages?: Array<{
      title: string;
    }>;
  };
  continue?: {
    apcontinue?: string;
  };
}

declare global {
  var __wikiRateGate: WikiRateGate | undefined;
  var __wikiGoalPoolCache: CacheEntry<string[]> | undefined;
  var __wikiTitleCache: Map<string, CacheEntry<string>> | undefined;
  var __wikiArticleCache: Map<string, CacheEntry<ArticleSnapshot>> | undefined;
  var __wikiBacklinkCache: Map<string, CacheEntry<string[]>> | undefined;
  var __wikiEdgeCache: Map<string, CacheEntry<boolean>> | undefined;
}

const wikiRateGate = globalThis.__wikiRateGate ?? { nextAt: 0, blockedUntil: 0 };
let goalPoolCache = globalThis.__wikiGoalPoolCache;
const titleCache = globalThis.__wikiTitleCache ?? new Map<string, CacheEntry<string>>();
const articleCache = globalThis.__wikiArticleCache ?? new Map<string, CacheEntry<ArticleSnapshot>>();
const backlinkCache = globalThis.__wikiBacklinkCache ?? new Map<string, CacheEntry<string[]>>();
const edgeCache = globalThis.__wikiEdgeCache ?? new Map<string, CacheEntry<boolean>>();

globalThis.__wikiRateGate = wikiRateGate;
globalThis.__wikiGoalPoolCache = goalPoolCache;
globalThis.__wikiTitleCache = titleCache;
globalThis.__wikiArticleCache = articleCache;
globalThis.__wikiBacklinkCache = backlinkCache;
globalThis.__wikiEdgeCache = edgeCache;

function normalizeTitle(title: string): string {
  return title.replace(/_/g, " ").trim();
}

function isNavigableTitle(title: string): boolean {
  const normalized = normalizeTitle(title);

  if (!normalized || normalized.includes("#") || normalized.includes(":")) {
    return false;
  }

  if (normalized.endsWith("(曖昧さ回避)") || normalized.endsWith("曖昧さ回避")) {
    return false;
  }

  return true;
}

function cleanTitles(titles: string[]): string[] {
  return unique(
    titles
      .map((title) => normalizeTitle(title))
      .filter((title) => isNavigableTitle(title))
  );
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const numericSeconds = Number(retryAfter);

  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return Math.floor(numericSeconds * 1000);
  }

  const dateMs = Date.parse(retryAfter);

  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

function getRetryDelayMs(status: number, attempt: number, retryAfter: string | null): number {
  const headerDelayMs = parseRetryAfterMs(retryAfter);

  if (headerDelayMs !== null) {
    return Math.min(WIKI_MAX_RETRY_WAIT_MS, headerDelayMs);
  }

  const base = status === 429 ? 900 : 350;
  const jitter = Math.floor(Math.random() * 220);
  return Math.min(WIKI_MAX_RETRY_WAIT_MS, base * 2 ** attempt + jitter);
}

async function waitForWikiRequestSlot() {
  const now = Date.now();
  const earliest = Math.max(now, wikiRateGate.nextAt, wikiRateGate.blockedUntil);
  const waitMs = earliest - now;

  wikiRateGate.nextAt = earliest + WIKI_MIN_INTERVAL_MS;

  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

async function fetchWikiJson<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(WIKI_API);

  Object.entries({
    format: "json",
    formatversion: "2",
    redirects: "1",
    ...params,
  }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  for (let attempt = 0; attempt <= WIKI_MAX_RETRIES; attempt += 1) {
    await waitForWikiRequestSlot();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WIKI_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Api-User-Agent": WIKI_API_USER_AGENT,
          "User-Agent": WIKI_API_USER_AGENT,
        },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const status = response.status;
      const retryAfter = response.headers.get("retry-after");
      const canRetry = WIKI_RETRYABLE_STATUS.has(status) && attempt < WIKI_MAX_RETRIES;

      if (canRetry) {
        const retryDelayMs = getRetryDelayMs(status, attempt, retryAfter);

        if (status === 429) {
          wikiRateGate.blockedUntil = Math.max(
            wikiRateGate.blockedUntil,
            Date.now() + retryDelayMs
          );
        }

        await sleep(retryDelayMs);
        continue;
      }

      throw new Error(`Wikipedia API request failed: ${status}`);
    } catch (error) {
      const isAbortError = error instanceof DOMException && error.name === "AbortError";
      const message = error instanceof Error ? error.message : String(error);
      const isTransientNetworkError =
        isAbortError || message.includes("fetch failed") || message.includes("network");

      if (attempt < WIKI_MAX_RETRIES && isTransientNetworkError) {
        await sleep(getRetryDelayMs(503, attempt, null));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Wikipedia API request failed");
}

export function toArticleUrl(title: string): string {
  return `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export async function resolveCanonicalTitle(title: string): Promise<string> {
  const normalizedTitle = normalizeTitle(title);
  const cached = titleCache.get(normalizedTitle);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const json = await fetchWikiJson<TitleResponse>({
    action: "query",
    titles: normalizedTitle,
  });

  const page = json?.query?.pages?.[0];

  if (!page || page.missing) {
    throw new Error(`Article not found: ${title}`);
  }

  const canonicalTitle = normalizeTitle(page.title);
  const expiresAt = Date.now() + TITLE_CACHE_MS;
  titleCache.set(normalizedTitle, { value: canonicalTitle, expiresAt });
  titleCache.set(canonicalTitle, { value: canonicalTitle, expiresAt });

  return canonicalTitle;
}

export async function fetchRandomTitle(): Promise<string> {
  const json = await fetchWikiJson<RandomResponse>({
    action: "query",
    list: "random",
    rnnamespace: "0",
    rnlimit: "1",
  });

  const randomTitle = json?.query?.random?.[0]?.title;

  if (!randomTitle || !isNavigableTitle(randomTitle)) {
    throw new Error("Failed to fetch random title");
  }

  return normalizeTitle(randomTitle);
}

export async function fetchExpandedGoalTitles(minCount = 1200): Promise<string[]> {
  if (goalPoolCache && goalPoolCache.expiresAt > Date.now() && goalPoolCache.value.length >= minCount) {
    return goalPoolCache.value;
  }

  const collectedTitles = goalPoolCache?.value ? [...goalPoolCache.value] : [];
  let apcontinue: string | undefined;
  let allPageFetchCount = 0;

  while (collectedTitles.length < minCount && allPageFetchCount < 8) {
    const json = await fetchWikiJson<AllPagesResponse>({
      action: "query",
      list: "allpages",
      apnamespace: "0",
      apfilterredir: "nonredirects",
      aplimit: String(ALL_PAGES_BATCH_LIMIT),
      ...(apcontinue ? { apcontinue } : {}),
    });

    const chunk = (json?.query?.allpages ?? []).map((item) => item.title);
    collectedTitles.push(...chunk);
    allPageFetchCount += 1;

    if (!json?.continue?.apcontinue) {
      break;
    }

    apcontinue = json.continue.apcontinue;
  }

  let randomFetchCount = 0;

  while (collectedTitles.length < minCount && randomFetchCount < 6) {
    const randomJson = await fetchWikiJson<RandomResponse>({
      action: "query",
      list: "random",
      rnnamespace: "0",
      rnlimit: "max",
    });

    const chunk = (randomJson?.query?.random ?? [])
      .map((item) => item.title ?? "")
      .filter((title) => title.length > 0);
    collectedTitles.push(...chunk);
    randomFetchCount += 1;
  }

  const cleaned = cleanTitles(collectedTitles);

  if (cleaned.length === 0) {
    throw new Error("Failed to fetch expanded goal titles");
  }

  const result = cleaned.slice(0, Math.max(minCount, 1800));
  goalPoolCache = { value: result, expiresAt: Date.now() + GOAL_POOL_CACHE_MS };
  globalThis.__wikiGoalPoolCache = goalPoolCache;

  return result;
}

export async function fetchBacklinks(title: string, limit = 200): Promise<string[]> {
  const normalizedTitle = normalizeTitle(title);
  const cacheKey = `${normalizedTitle}:${limit}`;
  const cached = backlinkCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const backlinks: string[] = [];
  let blcontinue: string | undefined;

  while (backlinks.length < limit) {
    const json = await fetchWikiJson<BacklinksResponse>({
      action: "query",
      list: "backlinks",
      bltitle: normalizedTitle,
      blnamespace: "0",
      blfilterredir: "nonredirects",
      bllimit: "max",
      ...(blcontinue ? { blcontinue } : {}),
    });

    const chunk = (json?.query?.backlinks ?? []).map((item: { title: string }) => item.title);
    backlinks.push(...chunk);

    if (!json?.continue?.blcontinue) {
      break;
    }

    blcontinue = json.continue.blcontinue;
  }

  const cleaned = cleanTitles(backlinks).slice(0, limit);
  backlinkCache.set(cacheKey, { value: cleaned, expiresAt: Date.now() + BACKLINK_CACHE_MS });

  return cleaned;
}

export async function fetchArticleSnapshot(title: string, maxLinks = 300): Promise<ArticleSnapshot> {
  const normalizedTitle = normalizeTitle(title);
  const cacheKey = `${normalizedTitle}:${maxLinks}`;
  const cached = articleCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const links: string[] = [];
  let plcontinue: string | undefined;
  let canonicalTitle = normalizedTitle;
  let extract = "";

  while (links.length < maxLinks) {
    const json = await fetchWikiJson<ArticleResponse>({
      action: "query",
      prop: "extracts|links",
      exintro: "1",
      explaintext: "1",
      plnamespace: "0",
      pllimit: "max",
      titles: canonicalTitle,
      ...(plcontinue ? { plcontinue } : {}),
    });

    const page = json?.query?.pages?.[0];

    if (!page || page.missing) {
      throw new Error(`Article not found: ${title}`);
    }

    canonicalTitle = normalizeTitle(page.title);
    extract = page.extract ?? extract;

    if (Array.isArray(page.links)) {
      links.push(...page.links.map((item: { title: string }) => item.title));
    }

    if (!json?.continue?.plcontinue) {
      break;
    }

    plcontinue = json.continue.plcontinue;
  }

  const snapshot: ArticleSnapshot = {
    title: canonicalTitle,
    extract: extract || "このページの要約は取得できませんでした。",
    links: cleanTitles(links).slice(0, maxLinks),
    url: toArticleUrl(canonicalTitle),
  };

  articleCache.set(cacheKey, { value: snapshot, expiresAt: Date.now() + ARTICLE_CACHE_MS });

  return snapshot;
}

export async function hasDirectLink(
  fromTitle: string,
  toTitle: string,
  scanLimit = 4500
): Promise<boolean> {
  const from = normalizeTitle(fromTitle);
  const to = normalizeTitle(toTitle);
  const cacheKey = `${from}->${to}:${scanLimit}`;
  const cached = edgeCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let plcontinue: string | undefined;
  let scanned = 0;

  while (scanned < scanLimit) {
    const json = await fetchWikiJson<ArticleResponse>({
      action: "query",
      prop: "links",
      plnamespace: "0",
      pllimit: "max",
      titles: from,
      ...(plcontinue ? { plcontinue } : {}),
    });

    const page = json?.query?.pages?.[0];

    if (!page || page.missing) {
      edgeCache.set(cacheKey, { value: false, expiresAt: Date.now() + EDGE_CACHE_MS });
      return false;
    }

    const links = Array.isArray(page.links) ? page.links : [];
    scanned += links.length;

    for (const link of links) {
      if (normalizeTitle(link.title) === to) {
        edgeCache.set(cacheKey, { value: true, expiresAt: Date.now() + EDGE_CACHE_MS });
        return true;
      }
    }

    if (!json?.continue?.plcontinue) {
      break;
    }

    plcontinue = json.continue.plcontinue;
  }

  edgeCache.set(cacheKey, { value: false, expiresAt: Date.now() + EDGE_CACHE_MS });
  return false;
}

export async function hasPathWithinDepth(
  startTitle: string,
  goalTitle: string,
  maxDepth: number,
  maxNodes = 800
): Promise<boolean> {
  const start = normalizeTitle(startTitle);
  const goal = normalizeTitle(goalTitle);

  if (start === goal) {
    return true;
  }

  const queue: Array<{ title: string; depth: number }> = [{ title: start, depth: 0 }];
  const visited = new Set<string>([start]);
  let index = 0;

  while (index < queue.length) {
    const current = queue[index++];

    if (current.depth >= maxDepth) {
      continue;
    }

    const article = await fetchArticleSnapshot(current.title, 140);

    if (article.links.includes(goal)) {
      return true;
    }

    for (const linkTitle of article.links.slice(0, 60)) {
      if (visited.has(linkTitle)) {
        continue;
      }

      visited.add(linkTitle);

      if (visited.size > maxNodes) {
        return false;
      }

      queue.push({ title: linkTitle, depth: current.depth + 1 });
    }
  }

  return false;
}

