import type { ReactNode } from "react";

export type IconName =
  | "arrow"
  | "book"
  | "grid"
  | "chart"
  | "check"
  | "chevron"
  | "clock"
  | "compass"
  | "credit"
  | "eye"
  | "eye-off"
  | "logout"
  | "search"
  | "user"
  | "lock"
  | "plus"
  | "close";

const paths: Record<IconName, ReactNode> = {
  arrow: (
    <>
      <path d="M19 12H5m6-6-6 6 6 6" />
    </>
  ),
  book: (
    <>
      <path d="M12 6v15m0-15C9 3 5 3 3 4v15c3-1 6 0 9 2 3-2 6-3 9-2V4c-2-1-6-1-9 2Z" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16M8 15v-3m5 3V8m5 7v-5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m14 6-6 6 6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-3 5-5 3 3-5 5-3Z" />
    </>
  ),
  credit: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9 5.5a10 10 0 0 1 3-.5c6 0 10 7 10 7a17 17 0 0 1-3 3.8M6 6.5A20 20 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5-1.2" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H5v16h5m4-12 4 4-4 4m-4-4h8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
