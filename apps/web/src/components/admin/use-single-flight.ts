"use client";

import { useRef, useState } from "react";
import { singleFlight } from "@/lib/single-flight";

/**
 * A request function for useMutation that never runs twice at once, however
 * fast the submit button is clicked. It always calls the latest `send`, so
 * props captured by the caller stay current.
 */
export function useSingleFlight<A extends unknown[], R>(
  send: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const latest = useRef(send);
  latest.current = send;
  const [guarded] = useState(() => singleFlight((...args: A) => latest.current(...args)));
  return guarded;
}
