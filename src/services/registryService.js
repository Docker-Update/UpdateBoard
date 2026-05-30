import semver from "semver";
import { safeJsonFetch, withTimeout } from "../utils/http.js";

const CACHE_TTL_MS = 10 * 60 * 1000;
const tagsCache = new Map();

function getCachedTags(key) {
  const item = tagsCache.get(key);
  if (!item) {
    return null;
  }

  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    tagsCache.delete(key);
    return null;
  }

  return item.tags;
}

function setCachedTags(key, tags) {
  tagsCache.set(key, { tags, timestamp: Date.now() });
}

async function fetchDockerHubTags(repository) {
  const tags = [];
  let nextUrl = `https://hub.docker.com/v2/repositories/${repository}/tags?page_size=100`;
  let page = 0;

  while (nextUrl && page < 5) {
    const payload = await withTimeout(safeJsonFetch(nextUrl), 8000);
    page += 1;

    for (const row of payload.results || []) {
      if (row?.name) {
        tags.push(row.name);
      }
    }

    nextUrl = payload.next;
  }

  return Array.from(new Set(tags));
}

async function fetchV2RegistryTags(registry, repository) {
  const url = `https://${registry}/v2/${repository}/tags/list`;
  const payload = await withTimeout(safeJsonFetch(url), 8000);
  return Array.isArray(payload.tags) ? payload.tags : [];
}

export async function fetchTags(registry, repository) {
  const cacheKey = `${registry}/${repository}`;
  const cached = getCachedTags(cacheKey);

  if (cached) {
    return cached;
  }

  let tags = [];

  if (registry === "docker.io") {
    tags = await fetchDockerHubTags(repository);
  } else {
    tags = await fetchV2RegistryTags(registry, repository);
  }

  setCachedTags(cacheKey, tags);
  return tags;
}

export function resolveLatestVersionTag(tags) {
  const normalized = tags
    .map((tag) => {
      const cleaned = tag.startsWith("v") ? tag.slice(1) : tag;
      const valid = semver.valid(cleaned);
      return valid ? { raw: tag, semver: valid } : null;
    })
    .filter(Boolean)
    .sort((a, b) => semver.rcompare(a.semver, b.semver));

  if (normalized.length > 0) {
    return {
      strategy: "semver",
      latestTag: normalized[0].raw,
      latestNormalized: normalized[0].semver
    };
  }

  if (tags.includes("latest")) {
    return {
      strategy: "latest-tag",
      latestTag: "latest",
      latestNormalized: "latest"
    };
  }

  return {
    strategy: "unknown",
    latestTag: null,
    latestNormalized: null
  };
}
