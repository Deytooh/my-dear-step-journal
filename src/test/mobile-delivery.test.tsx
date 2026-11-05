import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MomoImage } from "@/components/app/MomoImage";
import canonical from "@/assets/momo-hamster.png.asset.json";
import smallMomo from "@/assets/momo-hamster-small.webp";
import { APP_FONT_STYLESHEETS } from "@/lib/fonts";
import { tFor, type Key, type Locale } from "@/lib/i18n";

afterEach(cleanup);

it("uses one small mascot asset, preserving layout, transparency and canonical error fallback", () => {
  render(<MomoImage alt="Mascot fixture" width={72} height={88} className="object-contain" />);
  const image = screen.getByRole("img");
  expect(image).toHaveAttribute("src", smallMomo);
  expect(image).toHaveAttribute("width", "72");
  expect(image).toHaveAttribute("height", "88");
  expect(image).toHaveAttribute("decoding", "async");
  fireEvent.error(image);
  expect(image).toHaveAttribute("src", canonical.url);
  fireEvent.error(image);
  expect(image).toHaveAttribute("src", canonical.url);
});

it("subsets only the fixed question face with every supported translated glyph", () => {
  const body = new URL(APP_FONT_STYLESHEETS[0]);
  const question = new URL(APP_FONT_STYLESHEETS[1]);
  expect(body.searchParams.has("text")).toBe(false);
  expect(question.searchParams.get("family")).toBe("Noto Serif KR:wght@900");
  const glyphs = question.searchParams.get("text")!;
  const keys: Key[] = ["mq.day", "mq.feeling", "mq.food", "mq.treatment", "mq.moment"];
  for (const locale of ["ko", "en", "fr"] as Locale[]) {
    for (const key of keys) {
      for (const glyph of tFor(locale, key)) expect(glyphs).toContain(glyph);
    }
  }
});
