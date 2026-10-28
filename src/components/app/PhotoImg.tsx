import { useEffect, useState } from "react";
import { isStoredPhoto, photoUrl } from "@/lib/cloud-sync";

/** Shows a journal photo whether it is a local data URL or a private cloud file. */
export function PhotoImg({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(isStoredPhoto(src) ? null : src);
  useEffect(() => {
    let live = true;
    if (isStoredPhoto(src)) photoUrl(src).then((u) => live && setUrl(u));
    else setUrl(src);
    return () => { live = false; };
  }, [src]);
  if (!url) return <div className={`${className ?? ""} animate-pulse bg-secondary`} aria-hidden />;
  return <img src={url} alt={alt} className={className} />;
}
