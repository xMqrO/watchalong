// Brave-style Shields engine. This module is code-split from the main bundle
// (loaded via dynamic `import()` only when Shields are active) so the ~1 MB
// adblock engine never blocks app startup.
//
// Engine: @ghostery/adblocker (pure-JS, WASM-free) fed with Brave's OFFICIAL
// default filter-list sources from brave/adblock-resources (list_catalog.json):
//   - EasyList, EasyPrivacy, uBlock Origin filters (+ privacy / unbreak /
//     badware), URLhaus malware list
//   - Brave's own lists: unbreak, specific, social, sugarcoat
//   - Cookie-notice + social-mobile blockers (Brave defaults)
// Lists are fetched at runtime, parsed, then serialized (compressed) and
// cached in IndexedDB so subsequent visits load in <<1s without re-fetching.
// (Brave's own `adblock-rs` npm engine is a Node native addon and cannot run
// in a browser bundle; these are the exact lists Brave ships.)

export const BRAVE_LISTS = [
  {
    id: "easylist",
    title: "EasyList",
    url: "https://easylist.to/easylist/easylist.txt",
  },
  {
    id: "easyprivacy",
    title: "EasyPrivacy",
    url: "https://easylist.to/easylist/easyprivacy.txt",
  },
  {
    id: "ublock-filters",
    title: "uBlock Origin Filters",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
  },
  {
    id: "ublock-privacy",
    title: "uBlock Origin Privacy",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt",
  },
  {
    id: "ublock-unbreak",
    title: "uBlock Unbreak",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt",
  },
  {
    id: "ublock-badware",
    title: "uBlock Badware risks",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt",
  },
  {
    id: "urlhaus",
    title: "URLhaus Malicious URLs",
    url: "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-agh-online.txt",
  },
  {
    id: "brave-unbreak",
    title: "Brave Unbreak",
    url: "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt",
  },
  {
    id: "brave-specific",
    title: "Brave Specific",
    url: "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-specific.txt",
  },
  {
    id: "brave-social",
    title: "Brave Social",
    url: "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-social.txt",
  },
  {
    id: "brave-sugarcoat",
    title: "SugarCoat Rules",
    url: "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-sugarcoat.txt",
  },
  {
    id: "cookie-notice",
    title: "Cookie Notice Blocker",
    url: "https://secure.fanboy.co.nz/fanboy-cookiemonster_ubo.txt",
  },
  {
    id: "social-mobile",
    title: "Social Media Blocker",
    url: "https://easylist-downloads.adblockplus.org/fanboy-social.txt",
  },
];

export const DEFAULT_LIST_IDS = BRAVE_LISTS.map((l) => l.id);

const ENGINE_DB = "watchalong-shields";
const ENGINE_STORE = "engine";

let enginePromise = null; // memoized build/deserialize promise

function openEngineDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("no-indexeddb"));
    const req = indexedDB.open(ENGINE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENGINE_STORE)) {
        db.createObjectStore(ENGINE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexeddb-error"));
  });
}

async function idbPut(key, value) {
  try {
    const db = await openEngineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENGINE_STORE, "readwrite");
      tx.objectStore(ENGINE_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("idb-put"));
    });
  } catch {}
}

async function idbGet(key) {
  try {
    const db = await openEngineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENGINE_STORE, "readonly");
      const req = tx.objectStore(ENGINE_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error || new Error("idb-get"));
    });
  } catch {
    return null;
  }
}

/**
 * Fetch one filter list as text. Returns null on failure (per-list isolation:
 * one unreachable list never breaks the whole engine).
 */
async function fetchListText(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(25000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 100 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Build a complete engine from the given list ids. Downloads + parses every
 * enabled list (Brave's official sources), tolerating individual failures.
 */
export async function buildEngine(listIds) {
  const mod = await import("@ghostery/adblocker");
  const { FiltersEngine, parseFilters } = mod;

  const urls = BRAVE_LISTS.filter((l) => listIds.includes(l.id)).map(
    (l) => l.url,
  );
  if (!urls.length) return null;

  const networkFilters = [];
  const cosmeticFilters = [];
  const preprocessors = [];

  await Promise.all(
    urls.map(async (url) => {
      const text = await fetchListText(url);
      if (!text) return;
      try {
        const parsed = parseFilters(text, {
          loadNetworkFilters: true,
          loadCosmeticFilters: true,
        });
        networkFilters.push(...parsed.networkFilters);
        cosmeticFilters.push(...parsed.cosmeticFilters);
        preprocessors.push(...parsed.preprocessors);
      } catch {}
    }),
  );

  if (!networkFilters.length && !cosmeticFilters.length) return null;

  return new FiltersEngine({
    networkFilters,
    cosmeticFilters,
    preprocessors,
    config: {
      enableCompression: true,
      enableOptimizations: false,
      loadNetworkFilters: true,
      loadCosmeticFilters: true,
    },
  });
}

export function engineSerialize(engine) {
  return engine.serialize();
}

export async function engineDeserialize(buffer) {
  const mod = await import("@ghostery/adblocker");
  return mod.FiltersEngine.deserialize(buffer);
}

/**
 * Get an engine for the requested list ids. Uses the IndexedDB cache when the
 * cached engine was built from the exact same set of lists; otherwise (or on
 * mismatch) rebuilds + caches. Pass `force = true` to skip the cache and
 * re-download/parse everything (Settings -> Update lists).
 * Returns null if building failed (blocking just stays inactive).
 */
export async function getEngineForLists(listIds, force) {
  const key = "engine:" + [...listIds].sort().join("|");

  if (enginePromise) {
    const p = await enginePromise;
    if (!force && p && p.listKey === key) return p.engine;
    enginePromise = null;
  }

  enginePromise = (async () => {
    // 1) cached engine?
    if (!force) {
      try {
        const cached = await idbGet(key);
        if (cached) {
          const engine = await engineDeserialize(cached);
          return { listKey: key, engine, rebuilt: false };
        }
      } catch {}
    }

    // 2) build fresh
    const engine = await buildEngine(listIds);
    if (!engine) return { listKey: key, engine: null, rebuilt: false };

    // 3) persist for next visit
    if (!force) {
      try {
        const buffer = engineSerialize(engine);
        if (buffer && buffer.byteLength) await idbPut(key, buffer);
      } catch {}
    }

    return { listKey: key, engine, rebuilt: true };
  })();

  return (await enginePromise).engine;
}