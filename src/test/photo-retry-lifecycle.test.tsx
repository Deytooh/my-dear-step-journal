import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PhotoImg } from "@/components/app/PhotoImg";
import { clearPhotoCache, invalidatePhotoUrl, photoUrl } from "@/lib/cloud-sync";
import { setMediaOwner } from "@/lib/media";

const account = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null }));
const signed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/journal", () => ({ useJournal: () => account }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: signed }) } },
}));
const result = (url: string) => ({ data: { signedUrl: url } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(cleanup);
beforeEach(() => {
  account.user = { id: "A" };
  setMediaOwner("A");
  clearPhotoCache();
  signed
    .mockReset()
    .mockImplementation(async (path: string) => result(`https://example.invalid/${path}`));
});

it("gives a replacement source its own one-shot image error retry", async () => {
  const view = render(<PhotoImg src="storage:A/first" alt="Photo" />);
  fireEvent.error(await screen.findByRole("img", { name: "Photo" }));
  await screen.findByRole("img", { name: "Photo" });
  expect(signed).toHaveBeenCalledTimes(2);
  view.rerender(<PhotoImg src="storage:A/second" alt="Photo" />);
  fireEvent.error(await screen.findByRole("img", { name: "Photo" }));
  await act(async () => {});
  expect(signed).toHaveBeenCalledTimes(4);
  expect(screen.getByRole("img", { name: "Photo" })).toBeInTheDocument();
});

it("gives a new account its own one-shot image error retry", async () => {
  const view = render(<PhotoImg src="storage:A/first" alt="Photo" />);
  fireEvent.error(await screen.findByRole("img", { name: "Photo" }));
  await screen.findByRole("img", { name: "Photo" });
  account.user = { id: "B" };
  setMediaOwner("B");
  clearPhotoCache();
  view.rerender(<PhotoImg src="storage:B/first" alt="Photo" />);
  fireEvent.error(await screen.findByRole("img", { name: "Photo" }));
  await act(async () => {});
  expect(signed).toHaveBeenCalledTimes(4);
});

it("ignores an old source resolving after the replacement", async () => {
  const old = deferred<ReturnType<typeof result>>();
  signed.mockImplementationOnce(() => old.promise);
  const view = render(<PhotoImg src="storage:A/first" alt="Photo" />);
  view.rerender(<PhotoImg src="storage:A/second" alt="Photo" />);
  expect(await screen.findByRole("img", { name: "Photo" })).toHaveAttribute(
    "src",
    "https://example.invalid/A/second",
  );
  await act(async () => old.resolve(result("https://example.invalid/A/late-first")));
  expect(screen.getByRole("img", { name: "Photo" })).toHaveAttribute(
    "src",
    "https://example.invalid/A/second",
  );
});

it("ignores late URLs after account change and refuses cross-owner references", async () => {
  const old = deferred<ReturnType<typeof result>>();
  signed.mockImplementationOnce(() => old.promise);
  const view = render(<PhotoImg src="storage:A/first" alt="Photo" />);
  account.user = { id: "B" };
  setMediaOwner("B");
  clearPhotoCache();
  view.rerender(<PhotoImg src="storage:B/first" alt="Photo" />);
  expect(await screen.findByRole("img", { name: "Photo" })).toHaveAttribute(
    "src",
    "https://example.invalid/B/first",
  );
  await act(async () => old.resolve(result("https://example.invalid/A/late-first")));
  expect(screen.getByRole("img", { name: "Photo" })).toHaveAttribute(
    "src",
    "https://example.invalid/B/first",
  );
  expect(await photoUrl("storage:A/first")).toBeNull();
  expect(signed).toHaveBeenCalledTimes(2);
});

it("retrying one image does not discard a different image's pending URL", async () => {
  const second = deferred<ReturnType<typeof result>>();
  signed.mockImplementation((path: string) =>
    path === "A/second"
      ? second.promise
      : Promise.resolve(result(`https://example.invalid/${path}`)),
  );
  render(
    <>
      <PhotoImg src="storage:A/first" alt="First" />
      <PhotoImg src="storage:A/second" alt="Second" />
    </>,
  );
  fireEvent.error(await screen.findByRole("img", { name: "First" }));
  await screen.findByRole("img", { name: "First" });
  await act(async () => second.resolve(result("https://example.invalid/A/second")));
  expect(screen.queryByRole("img", { name: "Second" })).toBeInTheDocument();
});

it("does not loop signing requests when the refreshed image also fails", async () => {
  render(<PhotoImg src="storage:A/first" alt="Photo" />);
  fireEvent.error(await screen.findByRole("img", { name: "Photo" }));
  fireEvent.error(await screen.findByRole("img", { name: "Photo" }));
  await act(async () => {});
  expect(signed).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("img", { name: "Photo" })).not.toBeInTheDocument();
});

it("does not expose a pending account URL after sign-out", async () => {
  const old = deferred<ReturnType<typeof result>>();
  signed.mockImplementationOnce(() => old.promise);
  const pending = photoUrl("storage:A/first");
  account.user = null;
  setMediaOwner(null);
  clearPhotoCache();
  old.resolve(result("https://example.invalid/A/late-first"));
  expect(await pending).toBeNull();
  expect(await photoUrl("storage:A/first")).toBeNull();
});

it("does not let a late invalidated signing response overwrite the refreshed cache", async () => {
  const old = deferred<ReturnType<typeof result>>();
  signed.mockImplementationOnce(() => old.promise);
  const pending = photoUrl("storage:A/first");
  invalidatePhotoUrl("storage:A/first");
  signed.mockResolvedValueOnce(result("https://example.invalid/A/refreshed"));
  expect(await photoUrl("storage:A/first")).toBe("https://example.invalid/A/refreshed");
  old.resolve(result("https://example.invalid/A/stale"));
  expect(await pending).toBe("https://example.invalid/A/refreshed");
  expect(await photoUrl("storage:A/first")).toBe("https://example.invalid/A/refreshed");
  expect(signed).toHaveBeenCalledTimes(2);
});

it("removes the previous account image before layout effects observe the new account", async () => {
  const observed: Array<string | null> = [];
  function Frame({ accountId }: { accountId: string }) {
    const frame = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      observed.push(frame.current?.querySelector("img")?.getAttribute("src") ?? null);
    }, [accountId]);
    return (
      <div ref={frame}>
        <PhotoImg src="storage:A/first" alt="Photo" />
      </div>
    );
  }
  const view = render(<Frame accountId="A" />);
  await screen.findByRole("img", { name: "Photo" });
  account.user = { id: "B" };
  setMediaOwner("B");
  clearPhotoCache();
  // Keep the old src briefly, as can occur while account-owned journal data changes.
  view.rerender(<Frame accountId="B" />);
  expect(observed.at(-1)).toBeNull();
  await act(async () => {});
  expect(screen.queryByRole("img", { name: "Photo" })).not.toBeInTheDocument();
  expect(signed).toHaveBeenCalledTimes(1);
});

it("keeps a second rendering of the same photo available after another rendering refreshes it", async () => {
  const sibling = deferred<ReturnType<typeof result>>();
  signed
    .mockResolvedValueOnce(result("https://example.invalid/A/initial"))
    .mockImplementationOnce(() => sibling.promise)
    .mockResolvedValueOnce(result("https://example.invalid/A/refreshed"));
  render(
    <>
      <PhotoImg src="storage:A/shared" alt="First" />
      <PhotoImg src="storage:A/shared" alt="Second" />
    </>,
  );
  fireEvent.error(await screen.findByRole("img", { name: "First" }));
  expect(await screen.findByRole("img", { name: "First" })).toHaveAttribute(
    "src",
    "https://example.invalid/A/refreshed",
  );
  await act(async () => sibling.resolve(result("https://example.invalid/A/stale")));
  expect(screen.queryByRole("img", { name: "Second" })).toHaveAttribute(
    "src",
    "https://example.invalid/A/refreshed",
  );
});

it("checks the auth epoch before following a newer photo generation", async () => {
  const old = deferred<ReturnType<typeof result>>();
  signed.mockImplementationOnce(() => old.promise);
  const pending = photoUrl("storage:A/first");
  invalidatePhotoUrl("storage:A/first");
  clearPhotoCache();
  // Even a return to the same account must not revive an earlier session request.
  setMediaOwner("A");
  old.resolve(result("https://example.invalid/A/stale"));
  expect(await pending).toBeNull();
  expect(signed).toHaveBeenCalledTimes(1);
});

it("resolves the current generation when the invalidated request finishes before refresh", async () => {
  const old = deferred<ReturnType<typeof result>>();
  const refresh = deferred<ReturnType<typeof result>>();
  signed
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => refresh.promise)
    .mockResolvedValueOnce(result("https://example.invalid/A/current"));
  const pending = photoUrl("storage:A/first");
  invalidatePhotoUrl("storage:A/first");
  const refreshing = photoUrl("storage:A/first");
  old.resolve(result("https://example.invalid/A/stale"));
  expect(await pending).toBe("https://example.invalid/A/current");
  refresh.resolve(result("https://example.invalid/A/refreshed"));
  expect(await refreshing).toBe("https://example.invalid/A/refreshed");
  expect(signed).toHaveBeenCalledTimes(3);
});
