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
      timer.current = setTimeout(() => setCelebration(0), 320);
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
    const observe = () => {
      for (const element of seen) {
        if (!element.isConnected) {
          observer.unobserve(element);
          seen.delete(element);
        }
      }
      document.querySelectorAll(".feel-busy, .feel-indeterminate").forEach((element) => {
        if (!seen.has(element)) {
          seen.add(element);
          observer.observe(element);
        }
      });
    };
    observe();
    const changes = new MutationObserver(observe);
    changes.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("journal:celebrate", celebrate);
    return () => {
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
