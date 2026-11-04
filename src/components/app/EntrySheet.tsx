import * as Dialog from "@radix-ui/react-dialog";
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

function focusAvailable(element: HTMLElement | null | undefined) {
  if (!element?.isConnected || element === document.body || element.matches(":disabled"))
    return false;
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

/** One scroll surface and one viewport owner; no drag recognizer competes with form controls. */
export function EntrySheet({
  open,
  onOpenChange,
  returnFocusTo,
  fallbackFocus,
  onCloseAutoFocus,
  header,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: HTMLElement | null | undefined;
  fallbackFocus?: RefObject<HTMLElement | null> | undefined;
  onCloseAutoFocus?: (event: Event) => void;
  header: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const isOpen = useRef(open);
  useLayoutEffect(() => {
    isOpen.current = open;
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
            previousFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            panel.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            // Radix defers this callback. A newer opening owns focus by then.
            if (isOpen.current) {
              event.preventDefault();
              return;
            }
            onCloseAutoFocus?.(event);
            if (event.defaultPrevented) return;
            // This controlled dialog has no Radix Trigger to restore automatically.
            event.preventDefault();
            if (focusAvailable(returnFocusTo ?? previousFocus.current)) return;
            focusAvailable(fallbackFocus?.current);
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
