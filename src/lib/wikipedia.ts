import { ArticleSnapshot } from "./types";
import { unique } from "./utils";

const WIKI_API = "https://ja.wikipedia.org/w/api.php";
const ARTICLE_CACHE_MS = 10 * 60 * 1000;
const BACKLINK_CACHE_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
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

declare global {
  var __wikiArticleCache: Map<string, CacheEntry<ArticleSnapshot>> | undefined;
  var __wikiBacklinkCache: Map<string, CacheEntry<string[]>> | undefined;
}

const articleCache = globalThis.__wikiArticleCache ?? new Map<string, CacheEntry<ArticleSnapshot>>();
const backlinkCache = globalThis.__wikiBacklinkCache ?? new Map<string, CacheEntry<string[]>>();

globalThis.__wikiArticleCache = articleCache;
globalThis.__wikiBacklinkCache = backlinkCache;

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Wikipedia API request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function toArticleUrl(title: string): string {
  return `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
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

