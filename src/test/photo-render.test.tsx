import { act, cleanup, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PhotoImg } from "@/components/app/PhotoImg";
import { photoUrl } from "@/lib/cloud-sync";
const account = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null }));
vi.mock("@/lib/journal", () => ({ useJournal: () => account }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn(), clearPhotoCache: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  account.user = { id: "A" };
  vi.mocked(photoUrl).mockReset();
});

it("hides the previous source in the first committed render before a replacement photo resolves", async () => {
  const observed: Array<string | null> = [];
  let resolveNext!: (url: string) => void;
  vi.mocked(photoUrl)
    .mockResolvedValueOnce("https://example.invalid/first")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );
  function Frame({ src }: { src: string }) {
    const frame = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      observed.push(frame.current?.querySelector("img")?.getAttribute("src") ?? null);
    }, [src]);
    return (
      <div ref={frame}>
        <PhotoImg src={src} alt="Source" />
      </div>
    );
  }
  const view = render(<Frame src="localphoto:A:first" />);
  expect(await screen.findByRole("img", { name: "Source" })).toHaveAttribute(
    "src",
    "https://example.invalid/first",
  );
  view.rerender(<Frame src="localphoto:A:second" />);
  expect(observed.at(-1)).toBeNull();
  expect(screen.queryByRole("img", { name: "Source" })).not.toBeInTheDocument();
  await act(async () => resolveNext("https://example.invalid/second"));
  expect(screen.getByRole("img", { name: "Source" })).toHaveAttribute(
    "src",
    "https://example.invalid/second",
  );
});
