import * as Dialog from "@radix-ui/react-dialog";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** One scroll surface and one viewport owner; no drag recognizer competes with form controls. */
export function EntrySheet({
  open,
  onOpenChange,
  header,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = viewport?.height ?? window.innerHeight;
        const bottom = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
        panel.current?.style.setProperty(
          "--entry-height",
          `${Math.min(window.innerHeight * 0.92, height - 12)}px`,
        );
        panel.current?.style.setProperty("--entry-bottom", `${bottom}px`);
      });
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="entry-overlay fixed inset-0 z-50 bg-primary/35" />
        <Dialog.Content
          ref={panel}
          className="entry-sheet fixed inset-x-0 z-50 mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-primary/10 bg-background shadow-soft outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            panel.current?.focus({ preventScroll: true });
          }}
        >
          <div
            aria-hidden
            className="mx-auto mt-3 mb-1 h-1 w-12 shrink-0 rounded-full bg-primary/15"
          />
          {header}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
