import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { fmtNumber, t } from "@/lib/i18n";

export function celebrateSave() {
  window.dispatchEvent(new Event("journal:celebrate"));
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Values remain truthful: animate the reveal, never intermediate medical numbers. */
export function AnimatedValue({ value, digits = 1 }: { value: number; digits?: number }) {
  return (
    <span key={value} className="feel-value inline-block tabular-nums">
      {fmtNumber(value, digits)}
    </span>
  );
}

export function AppFeel() {
  const reduced = useReducedMotion();
  const [celebration, setCelebration] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const celebrate = () => {
      if (reduced) return;
      setCelebration((n) => n + 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCelebration(0), 360);
    };
    const visible = () => {
      document.documentElement.dataset["motionPaused"] = String(document.hidden);
    };
    visible();
    document.addEventListener("visibilitychange", visible);
    const seen = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) =>
          entry.target.classList.toggle("feel-offscreen", !entry.isIntersecting),
        ),
      { rootMargin: "40px" },
    );
    const selector = ".feel-busy, .feel-indeterminate, .momo-pending";
    const visit = (node: Node, add: boolean) => {
      if (!(node instanceof Element)) return;
      const update = (element: Element) => {
        if (add && !seen.has(element)) {
          seen.add(element);
          observer.observe(element);
        } else if (!add && seen.has(element) && !element.isConnected) {
          observer.unobserve(element);
          seen.delete(element);
        }
      };
      if (node.matches(selector)) update(node);
      node.querySelectorAll(selector).forEach(update);
    };
    const changes = new MutationObserver((records) => {
      for (const record of records) {
        record.removedNodes.forEach((node) => visit(node, false));
        record.addedNodes.forEach((node) => visit(node, true));
      }
    });
    if (!reduced) {
      visit(document.body, true);
      changes.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener("journal:celebrate", celebrate);
    let pressed: HTMLElement | null = null;
    let origin: { x: number; y: number; pointerId: number } | null = null;
    const release = () => {
      pressed?.removeAttribute("data-feel-pressed");
      pressed = null;
      origin = null;
    };
    const press = (event: PointerEvent) => {
      release();
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(".press");
      if (!control || control.matches(":disabled, [aria-disabled='true']")) return;
      pressed = control;
      origin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      control.dataset["feelPressed"] = "true";
    };
    const move = (event: PointerEvent) => {
      if (!pressed || !origin || origin.pointerId !== event.pointerId) return;
      const rect = pressed.getBoundingClientRect();
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12 ||
        event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) release();
    };
    document.addEventListener("pointerdown", press, { passive: true });
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("scroll", release, { capture: true, passive: true });
    window.addEventListener("blur", release);
    return () => {
      release();
      document.removeEventListener("pointerdown", press);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      document.removeEventListener("scroll", release, true);
      window.removeEventListener("blur", release);
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", visible);
      observer.disconnect();
      changes.disconnect();
      delete document.documentElement.dataset["motionPaused"];
      window.removeEventListener("journal:celebrate", celebrate);
    };
  }, [reduced]);
  if (!celebration || reduced) return null;
  return (
    <div key={celebration} className="feel-celebration" aria-hidden="true">
      <div className="feel-stamp">
        <Check className="size-4" strokeWidth={3} />
      </div>
      <span className="feel-saved-label">{t("toast.saved")}</span>
    </div>
  );
}
