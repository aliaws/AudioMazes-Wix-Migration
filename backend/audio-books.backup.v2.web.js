import wixData from 'wix-data';
import { Permissions, webMethod } from "wix-web-module";
import { mediaManager } from "wix-media-backend";

async function fetchAllInternal(collectionId, build) {
  const PAGE_SIZE = 1000;
  let q = wixData.query(collectionId);
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
  async (collectionId, build) => {
    return await fetchAllInternal(collectionId, build);
  }
);


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

export async function uniqueGenresAndSubGenres(
  items,
  {
    idKey = "_id",
    media = { productImages: "productImagesUrl", sampleAudio: "sampleAudioUrl", video: "videoUrl" },
    uniques = { genre: "parents", subGenre: "children" },
    concurrency = 10,
  } = {}
) {
  const contents = {};
  const needUris = [];
  const attachPlan = []; // [{ item, field, uri }]
  const uniqueSets = Object.fromEntries(Object.values(uniques).map((name) => [name, new Set()]));

  // 1) walk items: collect uniques + plan media resolves

   // NEW: relationship maps
  const childToParentsMap = new Map();   // child => Set(parents)
  const parentToChildrenMap = new Map(); // parent => Set(children)

  const parentsKey = uniques.genre ?? "parents";
  const childrenKey = uniques.subGenre ?? "children";


  for (const item of items) {
    // uniques (arrays or single values)
    // --- uniques + parent/child links ---
    const genresVal = Array.isArray(item?.genre)
      ? item.genre
      : (item?.genre ? [item.genre] : []);
    const subGenresVal = Array.isArray(item?.subGenre)
      ? item.subGenre
      : (item?.subGenre ? [item.subGenre] : []);

    // Add to uniques
 
    genresVal.forEach((g) => g != null && g !== "" && uniqueSets[parentsKey].add(g));
    subGenresVal.forEach((s) => s != null && s !== "" && uniqueSets[childrenKey].add(s));

    // Build relationships: every subGenre belongs to every genre on the same item
    for (const child of subGenresVal) {
      if (child == null || child === "") continue;
      if (!childToParentsMap.has(child)) childToParentsMap.set(child, new Set());
      const cset = childToParentsMap.get(child);
      for (const parent of genresVal) {
        if (parent == null || parent === "") continue;
        cset.add(parent);
        if (!parentToChildrenMap.has(parent)) parentToChildrenMap.set(parent, new Set());
        parentToChildrenMap.get(parent).add(child);
      }
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
  // Finalize uniques
  const genres = {};
  for (const [name, set] of Object.entries(uniqueSets)) {
    genres[name] = [...set];
  }

  // Convert relationship maps to plain objects
  const childrenObj = {};
  for (const [child, parentsSet] of childToParentsMap.entries()) {
    childrenObj[child] = [...parentsSet];
  }
  const parentsObj = {};
  for (const [parent, childrenSet] of parentToChildrenMap.entries()) {
    parentsObj[parent] = [...childrenSet];
  }

  // Replace "children" array with object map; also expose reverse map if you want it
  // If your uniques keys are custom, we still place them accordingly.
  if (genres[childrenKey]) genres[childrenKey] = childrenObj;
  // Optional: add reverse lookup
  genres.parentsMap = parentsObj;

  return { contents, genres };
}


export const indexBy = (items, key) => {
    const result = {};
    for (const item of items) {
      result[item[key]] = item;
    }
    return result;
};
