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
  const resolvedSource = useRef<string | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setUrl(null);
    setFailed(false);
    setLoaded(false);
    const resolve = () =>
      photoUrl(src)
        .then((value) => {
          if (live) {
            resolvedOwner.current = user?.id;
            resolvedSource.current = src;
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
  const visibleUrl =
    resolvedOwner.current === user?.id && resolvedSource.current === src ? url : null;
  return (
    <span
      className={`photo-frame block ${className ?? ""}`}
      data-loaded={loaded && !!visibleUrl}
      aria-busy={!failed && !loaded}
    >
      {failed ? (
        <span className="photo-failure" role="img" aria-label={t("photo.unavailable")}>
          {t("photo.unavailable")}
        </span>
      ) : visibleUrl ? (
        <img
          src={visibleUrl}
          loading="lazy"
          decoding="async"
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            if (!retry) {
              clearPhotoCache();
              setRetry(1);
            } else setFailed(true);
          }}
        />
      ) : null}
    </span>
  );
}
