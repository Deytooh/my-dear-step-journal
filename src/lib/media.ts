let activeOwner = "guest";
export const setMediaOwner = (owner: string | null) => {
  activeOwner = owner ?? "guest";
};
export const mediaOwner = () => activeOwner;
const db = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("mds.private-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function retainPhoto(data: string, owner = activeOwner): Promise<string> {
  if (!data.startsWith("data:")) return data;
  const hash = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data))),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const key = `localphoto:${owner}:${hash}`;
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("photos", "readwrite");
      tx.objectStore("photos").put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
  return key;
}
export async function readLocalPhoto(key: string, owner = activeOwner): Promise<string | null> {
  if (!key.startsWith(`localphoto:${owner}:`)) return null;
  const database = await db();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const r = database.transaction("photos").objectStore("photos").get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    database.close();
  }
}
export async function shrinkPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024)
    throw new Error("image");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 960 / Math.max(image.width, image.height));
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.round(image.width * scale),
      height: Math.round(image.height * scale),
    });
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.76);
    if (result.length > 1000000) throw new Error("image_size");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Explicit guest import copies local blobs into the confirmed account namespace. */
export async function copyGuestMedia<T>(value: T, owner: string): Promise<T> {
  const cache = new Map<string, string>();
  async function visit(input: unknown): Promise<unknown> {
    if (typeof input === "string" && input.startsWith("localphoto:guest:")) {
      if (cache.has(input)) return cache.get(input);
      const data = await readLocalPhoto(input, "guest");
      if (!data) throw new Error("photo_unavailable");
      const ref = await retainPhoto(data, owner);
      cache.set(input, ref);
      return ref;
    }
    if (Array.isArray(input)) return Promise.all(input.map(visit));
    if (input && typeof input === "object")
      return Object.fromEntries(
        await Promise.all(Object.entries(input).map(async ([k, v]) => [k, await visit(v)])),
      );
    return input;
  }
  return (await visit(value)) as T;
}
