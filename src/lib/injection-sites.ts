import { t, type Key } from "./i18n";

/** Six supported injection sites. Left/right are the user's own body sides (shown as if looking down at yourself). */
export const SITE_ZONES = [
  { id: "팔 왼쪽", key: "arm", side: "left", x: 46, y: 96 },
  { id: "팔 오른쪽", key: "arm", side: "right", x: 154, y: 96 },
  { id: "복부 왼쪽", key: "belly", side: "left", x: 77, y: 128 },
  { id: "복부 오른쪽", key: "belly", side: "right", x: 123, y: 128 },
  { id: "허벅지 왼쪽", key: "thigh", side: "left", x: 77, y: 190 },
  { id: "허벅지 오른쪽", key: "thigh", side: "right", x: 123, y: 190 },
] as const;

export const siteLabel = (id: string) => {
  const zone = SITE_ZONES.find((z) => z.id === id);
  return zone ? t(`site.${zone.key}.${zone.side}` as Key) : id;
};
