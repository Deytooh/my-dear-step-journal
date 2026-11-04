import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { downloadText } from "@/lib/download";
const previousCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const previousRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const create = vi.fn<(blob: Blob) => string>(() => "blob:fictional-export");
const revoke = vi.fn();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  create.mockClear();
  revoke.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (previousCreate) Object.defineProperty(URL, "createObjectURL", previousCreate);
  else delete (URL as unknown as Record<string, unknown>)["createObjectURL"];
  if (previousRevoke) Object.defineProperty(URL, "revokeObjectURL", previousRevoke);
  else delete (URL as unknown as Record<string, unknown>)["revokeObjectURL"];
});
it("starts one attached download with the intended UTF-8 content and releases temporary browser resources", async () => {
  let target: { filename: string; href: string | null; attached: boolean } | null = null;
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    target = {
      filename: this.download,
      href: this.getAttribute("href"),
      attached: document.body.contains(this),
    };
  });
  const text = "Fictional résumé — 기록\nUnknown dose";
  downloadText(text, "fictional-summary.txt");
  expect(click).toHaveBeenCalledOnce();
  expect(target).toEqual({
    filename: "fictional-summary.txt",
    href: "blob:fictional-export",
    attached: true,
  });
  expect(document.querySelector('a[download="fictional-summary.txt"]')).toBeNull();
  const blob = create.mock.calls[0]![0] as Blob;
  expect(blob.type).toBe("text/plain;charset=utf-8");
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
  expect(content).toBe(text);
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:fictional-export");
});
it("does not leak an attached link or blob URL if the browser rejects starting the download", () => {
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => downloadText("Fictional backup", "fictional.json", "application/json")).toThrow(
    "blocked",
  );
  expect(document.querySelector('a[download="fictional.json"]')).toBeNull();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:fictional-export");
});
