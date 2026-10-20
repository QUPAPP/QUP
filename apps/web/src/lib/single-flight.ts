/**
 * Wraps a request so that calling it again while it is in flight returns the
 * same promise instead of sending a second request. A fast double click fires
 * both submits before the disabled button re-renders; this keeps it to one.
 */
export function singleFlight<A extends unknown[], R>(
  send: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  let inFlight: Promise<R> | null = null;
  return (...args: A) => {
    if (inFlight) return inFlight;
    const request = send(...args).finally(() => {
      inFlight = null;
    });
    inFlight = request;
    return request;
  };
}
