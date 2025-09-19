import wixData from 'wix-data';
import { Permissions, webMethod } from "wix-web-module";
import { mediaManager } from "wix-media-backend";

const GENERS_MAP = {
  "Supernatural Thriller": "Thriller",
  "Psychological Thriller": "Thriller",
  "Road/Survival Horror": "Horror",
  "Ghost in the Machine": "Sci-Fi",
  "Private Investigator": "Thriller",
  "Paranormal Mystery": "Paranormal Mystery",
  "Paranormal Romance": "Romance",
  "Urban Fantasy": "Urban Fantasy",
  "Drama and Romance": "Romance",
  "Magical Realism": "Contemporary Fiction",
  "Western": "Historical Fiction",
  "Adventure": "Adventure",
  "Portal Fantasy": "Fantasy",
  "Epic Fantasy": "Fantasy",
  "Fairy Tale": "Fantasy",
  "Romantasy": "Fantasy",
  "Fantasy Romance": "Fantasy",
  "Space Opera": "Sci-Fi"
}

async function fetchAllInternal(collectionId, build, includes = []) {
  const PAGE_SIZE = 1000;
  let q = wixData.query(collectionId);
  
  includes.forEach(field => {
    q = q.include(field);   // reassign q each time
  });
  
  if (typeof build === "function") q = build(q);

  let res = await q.limit(PAGE_SIZE).find();
  const items = [...res.items];

  while (res.hasNext()) {
    res = await res.next();
    items.push(...res.items);
  }
  return items;
}




export const fetchAll = webMethod(
  Permissions.Anyone,
  async (collectionId, includes = [], build) => {
    return await fetchAllInternal(collectionId, build, includes);
  }
);


export const getBookSponsorMap = webMethod(Permissions.Anyone, async () => {
  const PAGE_SIZE = 1000;

  // Query the OWNER side of the relation (sponsorships)
  let q = wixData.query('sponsorships')
    .isNotEmpty('PremiumAudiobooks_sponsorshipsReferences')   // <-- field key on sponsorships
    .include("PremiumAudiobooks_sponsorshipsReferences")
    .limit(PAGE_SIZE);

  let res = await q.find();

  // Result: { [bookId]: [sponsorId, ...] }
  const map = {};

  const add = (items) => {
    for (const s of items) {
      // multi-ref returns IDs (strings). If you ever .include(), handle objects too:
      const bookIds = (s.PremiumAudiobooks_sponsorshipsReferences || [])
        .map(x => (typeof x === 'string' ? x : x?._id))
        .filter(Boolean);

      for (const bookId of bookIds) {
        if (!map[bookId]) map[bookId] = [];
        map[bookId].push(s._id);
      }
    }
  };

  add(res.items);
  while (res.hasNext()) {
    res = await res.next();
    add(res.items);
  }

  // dedupe sponsor IDs per book
  for (const k in map) map[k] = [...new Set(map[k])];

  return map;
});

const isWixUri = (u) => typeof u === "string" && /^wix:/.test(u);
const pickMediaUrl = (val) => {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    for (const v of val) {
      if (typeof v === "string") return v;
      if (v?.url) return v.url;
      if (v?.src) return v.src;
    }
    return null;
  }
  return val.url || val.src || null;
};

// simple async pool
async function asyncPool(limit, items, worker) {
  const ret = [];
  const executing = new Set();
  for (const it of items) {
    const p = Promise.resolve().then(() => worker(it));
    ret.push(p);
    executing.add(p);
    p.finally(() => executing.delete(p));
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

async function getDownloadUrlFast(uri) {
  return mediaManager.getDownloadUrl(uri);
}

export async function buildIndexAndFacets(
  items,
  {
    idKey = "_id",
    includes = [],
    media = { productImages: "productImagesUrl", sampleAudio: "sampleAudioUrl", video: "videoUrl" },
    uniques = { genre: "parents", subGenre: "children", discretion: "discretions", glimmers: "glimmers" },
    concurrency = 10,
  } = {}
) {
  const contents = {};
  const needUris = [];
  const attachPlan = []; // [{ item, field, uri }]
  const uniqueSets = Object.fromEntries(Object.values(uniques).map((name) => [name, new Set()]));

  // 1) walk items: collect uniques + plan media resolves
  for (const item of items) {
    // uniques (arrays or single values)
    for (const [fromKey, outName] of Object.entries(uniques)) {
      const v = item?.[fromKey];
      if (Array.isArray(v)) v.forEach((x) => x != null && x !== "" && uniqueSets[outName].add(x));
      else if (v != null && v !== "") uniqueSets[outName].add(v);
    }

    // media (flexible map)
    for (const [inKey, outKey] of Object.entries(media)) {
      const raw = item?.[inKey];
      const u = pickMediaUrl(raw);
      if (!u) continue;

      if (isWixUri(u)) {
        needUris.push(u);
        attachPlan.push({ item, field: outKey, uri: u });
      } else {
        item[outKey] = u; // already http(s)
      }
    }

    // index
    contents[item[idKey]] = item;
  }

  // 2) dedupe + resolve wix:* in parallel
  const uniqueUris = Array.from(new Set(needUris));
  const resolvedMap = new Map();
  await asyncPool(concurrency, uniqueUris, async (uri) => {
    try {
      resolvedMap.set(uri, await getDownloadUrlFast(uri));
    } catch (e) {
      resolvedMap.set(uri, null);
      console.warn("getDownloadUrl failed:", uri, e);
    }
  });

  // 3) attach results
  for (const { item, field, uri } of attachPlan) {
    const dl = resolvedMap.get(uri);
    if (dl) item[field] = dl;
  }

  // 4) finalize uniques (keep your original shape names if provided)
  const genres = {};
  for (const [name, set] of Object.entries(uniqueSets)) {
    genres[name] = [...set];
  }

  return { contents, genres, map: GENERS_MAP };
}


export const indexBy = (items, key) => {
    const result = {};
    for (const item of items) {
      result[item[key]] = item;
    }
    return result;
};


