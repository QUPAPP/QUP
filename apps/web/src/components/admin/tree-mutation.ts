"use client";

import { useMutation } from "@tanstack/react-query";
import { isApiError } from "@/lib/api";
import { useSingleFlight } from "./use-single-flight";

/**
 * A change to the taxonomy tree. Success hands back to the page, which
 * refetches the tree — the interface never patches it locally. If another
 * admin published the version meanwhile, the API answers
 * TAXONOMY_VERSION_NOT_DRAFT; the tree is refetched then too, so the screen
 * turns read-only instead of offering edits that will fail.
 */
export function useTreeMutation<T>(
  mutationFn: (input: T) => Promise<unknown>,
  { onDone, onStale }: { onDone: () => void; onStale: () => void },
) {
  return useMutation({
    mutationFn: useSingleFlight(mutationFn),
    onSuccess: onDone,
    onError: (error) => {
      if (isApiError(error, "TAXONOMY_VERSION_NOT_DRAFT")) onStale();
    },
  });
}
