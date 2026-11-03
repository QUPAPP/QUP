"use client";

import { useEffect, useState } from "react";

const DURATION_MS = 700;

/**
 * A number that counts up from zero once, when it first appears. Readers who
 * ask for reduced motion, and screen readers, get the final value at once.
 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="visually-hidden">{value}</span>
    </>
  );
}
