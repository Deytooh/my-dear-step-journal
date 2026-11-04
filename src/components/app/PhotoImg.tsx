import { useEffect, useState } from "react";
import { photoUrl, invalidatePhotoUrl } from "@/lib/cloud-sync";
import { useJournal } from "@/lib/journal";
import { t } from "@/lib/i18n";
type PhotoImgProps = {
  src: string;
  alt?: string;
  className?: string;
};

export function PhotoImg(props: PhotoImgProps) {
  const { user } = useJournal();
  // Remount all display and retry state together when the photo or account changes.
  return <PhotoImage key={JSON.stringify([user?.id ?? null, props.src])} {...props} />;
}

function PhotoImage({ src, alt = "", className }: PhotoImgProps) {
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
  }, [src, retry]);
  return (
    <span
      className={`photo-frame block ${className ?? ""}`}
      data-loaded={loaded && !!url}
      aria-busy={!failed && !loaded}
    >
      {failed ? (
        <span className="photo-failure" role="img" aria-label={t("photo.unavailable")}>
          {t("photo.unavailable")}
        </span>
      ) : url ? (
        <img
          src={url}
          loading="lazy"
          decoding="async"
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            if (!retry) {
              invalidatePhotoUrl(src);
              setRetry(1);
            } else setFailed(true);
          }}
        />
      ) : null}
    </span>
  );
}
