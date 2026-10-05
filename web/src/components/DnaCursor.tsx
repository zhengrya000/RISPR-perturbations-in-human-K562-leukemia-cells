"use client";

import { useEffect, useRef } from "react";
import { Dna } from "lucide-react";

export default function DnaCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = cursor.current!;
    const root = element.closest<HTMLElement>(".observatory")!;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const hide = () => { element.dataset.visible = "false"; delete root.dataset.dnaCursor; };
    const move = (event: PointerEvent) => {
      if (!finePointer.matches || event.pointerType !== "mouse") { hide(); return; }
      // Native text and select controls retain their familiar cursor behavior.
      if ((event.target as HTMLElement).closest("input, textarea, select")) { hide(); return; }
      root.dataset.dnaCursor = "true";
      element.dataset.visible = "true";
      element.dataset.action = String(!!(event.target as HTMLElement).closest("button:not(:disabled), a, summary"));
      element.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    finePointer.addEventListener("change", hide);
    return () => {
      hide();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      finePointer.removeEventListener("change", hide);
    };
  }, []);
  return <div ref={cursor} className="dna-cursor" data-visible="false" aria-hidden="true"><Dna size={24} strokeWidth={1.2}/></div>;
}
