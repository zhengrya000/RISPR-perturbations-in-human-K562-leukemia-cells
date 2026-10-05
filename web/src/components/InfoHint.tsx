"use client";

import { useId, useState, type ReactNode } from "react";

export default function InfoHint({ children, definition }: { children: ReactNode; definition: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="term-hint" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button className="term-label" aria-describedby={id} aria-expanded={open} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={(event) => {
      if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); }
    }}>{children}</button>
    <span id={id} role="tooltip" className="term-definition" data-open={open}>{definition}</span>
  </span>;
}
