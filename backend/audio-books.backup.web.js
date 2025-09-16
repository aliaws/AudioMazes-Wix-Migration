import wixData from 'wix-data';
import { Permissions, webMethod } from "wix-web-module";
import { mediaManager } from "wix-media-backend";
import { Exception } from 'sass';


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

export async function buildIndexAndFacets(items) {
  const allGenres = [];
  const allSubGenres = [];
  const books = {};

  const resolveOne = async (uri) =>
    uri ? await getDownloadUrl(uri) : null;

  const resolveMany = async (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return Promise.all(val.map(resolveOne));
    return [await resolveOne(val)];
  };

  let i = 0;
  for (const item of items) {
    if (Array.isArray(item.genre)) allGenres.push(...item.genre);
    if (Array.isArray(item.subGenre)) allSubGenres.push(...item.subGenre);

    // Convert Wix media URIs safely
    // const [audioUrls, videoUrls, imageUrls] = await Promise.all([
    //   resolveMany(item.sampleAudio),
    //   resolveMany(item.video),
    //   resolveMany(item.productImages),
    // ]);

    // // Attach resolved URLs
    // item.sampleAudioUrls = audioUrls.filter(Boolean);
    // item.videoUrls = videoUrls.filter(Boolean);
    // item.productImageUrls = imageUrls.filter(Boolean);

    //if (i <=11) {
      item.productImagesUrl = await getDownloadUrl(item.productImages);
      item.sampleAudioUrl = await getDownloadUrl(item.sampleAudio);
      item.videoUrl = await getDownloadUrl(item.video);
    //}

    books[item._id] = item;
    i++;
  }

  return {
    books,
    genres: {
      parents: [...new Set(allGenres)],
      children: [...new Set(allSubGenres)],
    },
  };
}

export const getDownloadUrl = webMethod(
  Permissions.Anyone,
  async (fileUrl) => {
    try {
      const myFileDownloadUrl = await mediaManager.getDownloadUrl(fileUrl);
      return myFileDownloadUrl;
    } catch (error) {
      console.error(error);
      return error;
    }
  },
);


export const getDownloadFiles = webMethod(
  Permissions.Anyone,
  async (fileUrls) => {
    return await mediaManager.downloadFiles(fileUrls);
  }
);

export const indexBy = (items, key) => {
    const result = {};
    for (const item of items) {
      result[item[key]] = item;
    }
    return result;
};
