/**
 * Liveness of the web server itself. Deliberately does not call the API: a
 * platform that restarts this container because the API is down fixes nothing.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
