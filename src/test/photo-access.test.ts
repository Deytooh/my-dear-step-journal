import { beforeEach, expect, it, vi } from "vitest";
import { photoUrl, clearPhotoCache } from "@/lib/cloud-sync";
import { setMediaOwner } from "@/lib/media";
const signed = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: signed }) } },
}));
beforeEach(() => {
  clearPhotoCache();
  setMediaOwner("A");
  signed.mockReset().mockResolvedValue({ data: { signedUrl: "https://example.invalid/owner-A" } });
});
it("renews expiring links and refuses another account's source", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  expect(await photoUrl("storage:A/source")).toContain("owner-A");
  await photoUrl("storage:A/source");
  expect(signed).toHaveBeenCalledTimes(1);
  now.mockReturnValue(60 * 60 * 1000);
  await photoUrl("storage:A/source");
  expect(signed).toHaveBeenCalledTimes(2);
  setMediaOwner("B");
  clearPhotoCache();
  expect(await photoUrl("storage:A/source")).toBeNull();
  now.mockRestore();
});
it("does not cache or expose a link returned after sign-out", async () => {
  let finish!: (value: unknown) => void;
  signed.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = photoUrl("storage:A/source");
  setMediaOwner(null);
  clearPhotoCache();
  finish({ data: { signedUrl: "https://example.invalid/late-A" } });
  expect(await pending).toBeNull();
});
