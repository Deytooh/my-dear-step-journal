// Only a deliberate sign-in from Momo may offer the guest's unsent input.
// Bind the offer to the first returning account, never another account on this tab.
const HANDOFF = "mds.momo.signin-handoff";
const GUEST = "mds.momo.draft.guest";
const TTL = 30 * 60 * 1000;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type GuestCapture = { text: string; images: string[]; usedVoice: boolean };
export function prepareMomoHandoff(store: Store, hasInput: boolean, now = Date.now()) {
  try {
    if (hasInput) store.setItem(HANDOFF, JSON.stringify({ expires: now + TTL, owner: null }));
    else store.removeItem(HANDOFF);
    return true;
  } catch {
    /* The composer can offer an explicit sign-in without recovery. */
    return false;
  }
}
export function dismissMomoHandoff(store: Store) {
  try {
    store.removeItem(HANDOFF);
  } catch {
    /* Leave the original guest capture intact. */
  }
}
export function claimMomoHandoff(
  store: Store,
  owner: string,
  now = Date.now(),
): GuestCapture | null {
  if (!owner || owner === "guest") return null;
  try {
    const marker = JSON.parse(store.getItem(HANDOFF) ?? "null");
    if (
      !marker ||
      typeof marker.expires !== "number" ||
      !Number.isFinite(marker.expires) ||
      marker.expires <= now ||
      marker.expires > now + TTL ||
      (marker.owner !== null && marker.owner !== owner)
    )
      return null;
    const raw = store.getItem(GUEST);
    // Include JSON escaping/metadata for the bounded text and three data images.
    if (!raw || raw.length > 4_000_000) return null;
    const data = JSON.parse(raw);
    if (
      typeof data.text !== "string" ||
      data.text.length > 100_000 ||
      !Array.isArray(data.images) ||
      data.images.length > 3 ||
      !data.images.every(
        (image: unknown) =>
          typeof image === "string" &&
          image.length <= 1_000_000 &&
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image),
      ) ||
      (!data.text.trim() && !data.images.length)
    )
      return null;
    store.setItem(HANDOFF, JSON.stringify({ expires: marker.expires, owner }));
    // Raw input only: AI proposals, old consent and voice sessions never cross the boundary.
    return { text: data.text, images: data.images, usedVoice: data.usedVoice === true };
  } catch {
    return null;
  }
}
