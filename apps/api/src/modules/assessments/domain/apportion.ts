/**
 * Splits `total` slots across entries in proportion to their weights, never
 * giving an entry more than its capacity (largest-remainder method, with
 * capped entries' share redistributed to the rest).
 *
 * Exact: the result sums to min(total, total capacity), with no rounding bias
 * toward the first entries. Ties on the remainder go to the higher weight,
 * then to the earlier entry, so the result is deterministic.
 */
export interface ApportionEntry<K> {
  key: K;
  weight: number;
  capacity: number;
}

export function apportion<K>(total: number, entries: readonly ApportionEntry<K>[]): Map<K, number> {
  const result = new Map<K, number>(entries.map((e) => [e.key, 0]));
  let remaining = Math.min(
    total,
    entries.reduce((sum, e) => sum + Math.max(0, e.capacity), 0),
  );

  let open = entries.filter((e) => e.capacity > 0 && e.weight > 0);
  while (remaining > 0 && open.length > 0) {
    const weightSum = open.reduce((sum, e) => sum + e.weight, 0);
    const shares = open.map((e, index) => {
      const exact = (remaining * e.weight) / weightSum;
      const room = e.capacity - (result.get(e.key) ?? 0);
      return {
        entry: e,
        index,
        room,
        floor: Math.min(Math.floor(exact), room),
        fraction: exact % 1,
      };
    });

    let handed = 0;
    for (const share of shares) {
      result.set(share.entry.key, (result.get(share.entry.key) ?? 0) + share.floor);
      handed += share.floor;
    }

    // Remainder: one slot each, largest fraction first, to entries with room.
    const byRemainder = shares
      .filter((s) => s.room > s.floor)
      .sort(
        (a, b) => b.fraction - a.fraction || b.entry.weight - a.entry.weight || a.index - b.index,
      );
    for (const share of byRemainder) {
      if (handed >= remaining) break;
      result.set(share.entry.key, (result.get(share.entry.key) ?? 0) + 1);
      handed += 1;
    }

    remaining -= handed;
    open = open.filter((e) => (result.get(e.key) ?? 0) < e.capacity);
    if (handed === 0) break; // nothing more can be placed
  }
  return result;
}
