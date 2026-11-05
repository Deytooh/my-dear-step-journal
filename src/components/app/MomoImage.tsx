import { useState, type ImgHTMLAttributes } from "react";
import canonical from "@/assets/momo-hamster.png.asset.json";
import smallMomo from "@/assets/momo-hamster-small.webp";

/** Same canonical artwork, losslessly encoded at 3× the largest 88px placement. */
export function MomoImage({
  onError,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet">) {
  const [useOriginal, setUseOriginal] = useState(false);
  return (
    <img
      decoding="async"
      {...props}
      src={useOriginal ? canonical.url : smallMomo}
      onError={(event) => {
        if (!useOriginal) setUseOriginal(true);
        onError?.(event);
      }}
    />
  );
}
