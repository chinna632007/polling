/**
 * naturalSort.js (frontend)
 * ==========================
 * Natural (numeric-aware) comparison so Officer IDs / Booth IDs sort the way
 * humans expect:
 *
 *   OFF1, OFF2, OFF10, OFF20   (NOT OFF1, OFF10, OFF2)
 *   PB2, PB10                  (NOT PB10, PB2)
 *
 * Uses String.localeCompare with { numeric: true } so embedded digit runs
 * are compared as numbers, with case-insensitive 'base' sensitivity.
 */

/** Ascending natural comparison for two values (Officer ID / Booth ID / etc.). */
export function naturalCompare(a, b) {
  return String(a ?? '')
    .localeCompare(String(b ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
}

/** Alias kept for parity with the backend utility naming. */
export function compareOfficerIds(a, b) {
  return naturalCompare(a, b);
}

/** Ascending natural comparison for booth numbers (PB2 before PB10). */
export function compareBoothIds(a, b) {
  return naturalCompare(a, b);
}

/**
 * Sorts an array of objects by Officer ID ascending (natural numeric order).
 * `pick` extracts the Officer ID string from each item; ties are broken by
 * `_id` for a stable, deterministic result.
 *
 * Returns a NEW array; the original is not mutated.
 */
export function sortByOfficerId(list, pick = (item) => item?.officerId) {
  return [...(list || [])].sort((a, b) => {
    const byId = compareOfficerIds(pick(a), pick(b));
    if (byId !== 0) return byId;
    return naturalCompare(a?._id, b?._id);
  });
}
