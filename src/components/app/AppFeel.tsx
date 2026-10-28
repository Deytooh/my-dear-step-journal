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
  return <span key={value} className="feel-value inline-block tabular-nums">{fmtNumber(value, digits)}</span>;
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
      timer.current = setTimeout(() => setCelebration(0), 950);
    };
    const press = (event: PointerEvent) => {
      if (reduced || event.button !== 0 || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>("button, a, [role=tab]");
      if (!target || target.matches(":disabled, [aria-disabled=true]")) return;
      const rect = target.getBoundingClientRect();
      const ring = document.createElement("span");
      ring.className = "feel-touch";
      ring.setAttribute("aria-hidden", "true");
      ring.style.left = `${Math.max(rect.left + 8, Math.min(event.clientX, rect.right - 8))}px`;
      ring.style.top = `${Math.max(rect.top + 8, Math.min(event.clientY, rect.bottom - 8))}px`;
      document.body.appendChild(ring);
      ring.addEventListener("animationend", () => ring.remove(), { once: true });
    };
    const input = (event: Event) => {
      if (reduced || !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
      const field = event.target;
      if (["checkbox", "file", "radio"].includes(field.type)) return;
      field.getAnimations().forEach((a) => a.cancel());
      field.animate([{ borderColor: "var(--peach-accent)" }, { borderColor: "var(--primary)" }], { duration: 300, easing: "ease-out" });
    };
    document.addEventListener("pointerdown", press, { passive: true });
    document.addEventListener("input", input);
    window.addEventListener("journal:celebrate", celebrate);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("pointerdown", press);
      document.removeEventListener("input", input);
      window.removeEventListener("journal:celebrate", celebrate);
      document.querySelectorAll(".feel-touch").forEach((ring) => ring.remove());
    };
  }, [reduced]);
  if (!celebration || reduced) return null;
  return (
    <div key={celebration} className="feel-celebration" aria-hidden="true">
      <div className="feel-stamp"><Check className="size-7" strokeWidth={3} /></div>
      <span className="feel-saved-label">{t("toast.saved")}</span>
      <div className="feel-petals">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
    </div>
  );
}