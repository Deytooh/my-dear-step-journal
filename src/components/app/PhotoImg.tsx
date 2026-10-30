import { useEffect, useRef, useState } from "react";
import { photoUrl, clearPhotoCache } from "@/lib/cloud-sync";
import { useJournal } from "@/lib/journal";
import { t } from "@/lib/i18n";
export function PhotoImg({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const { user } = useJournal();
  const resolvedOwner = useRef<string | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setUrl(null);
    setFailed(false);
    const resolve = () =>
      photoUrl(src)
        .then((value) => {
          if (live) {
            resolvedOwner.current = user?.id;
            setUrl(value);
            setFailed(!value);
          }
        })
        .catch(() => {
          if (live) setFailed(true);
        });
    resolve();
    const timer = setInterval(resolve, 50 * 60 * 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [src, user?.id, retry]);
  if (resolvedOwner.current !== user?.id)
    return <div className={`${className ?? ""} bg-secondary`} />;
  if (failed)
    return (
      <span className={className} role="img" aria-label={t("photo.unavailable")}>
        {t("photo.unavailable")}
      </span>
    );
  if (!url) return <div className={`${className ?? ""} bg-secondary`} aria-busy="true" />;
  return (
    <img
      src={url}
      loading="lazy"
      decoding="async"
      alt={alt}
      className={className}
      onError={() => {
        if (!retry) {
          clearPhotoCache();
          setRetry(1);
        } else setFailed(true);
      }}
    />
  );
}
