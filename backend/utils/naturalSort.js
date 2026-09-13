/**
 * naturalSort.js
 * ==============
 * Natural (numeric-aware) comparison so IDs sort the way humans expect:
 *
 *   OFF1, OFF2, OFF10, OFF20   (NOT OFF1, OFF10, OFF2)
 *   PB2, PB10                  (NOT PB10, PB2)
 *
 * Uses String.localeCompare with { numeric: true } so embedded digit runs are
 * compared as numbers, with case-insensitive 'base' sensitivity.
 */

function naturalCompare(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/** Ascending Officer ID order (natural: OFF1 < OFF2 < OFF10 < OFF20). */
function compareOfficerIds(a, b) {
  return naturalCompare(a, b);
}

/** Ascending Booth ID / Booth Number order (natural: PB2 < PB10). */
function compareBoothIds(a, b) {
  return naturalCompare(a, b);
}

/**
 * Sorts a list of documents by Officer ID ascending (natural order).
 * `pick` extracts the Officer ID; ties are broken by _id for stability.
 */
function sortByOfficerId(list, pick = (item) => item?.officerId) {
  return [...(list || [])].sort((a, b) => {
    const byId = compareOfficerIds(pick(a), pick(b));
    if (byId !== 0) return byId;
    return String(a?._id ?? '').localeCompare(String(b?._id ?? ''));
  });
}

/**
 * Sorts a list of booth documents by Booth Number then Booth ID ascending
 * (natural order, so PB2 comes before PB10).
 */
function sortByBoothId(
  list,
  pickNumber = (item) => item?.boothNumber,
  pickId = (item) => item?.boothId
) {
  return [...(list || [])].sort((a, b) => {
    const byNumber = compareBoothIds(pickNumber(a), pickNumber(b));
    if (byNumber !== 0) return byNumber;
    return compareBoothIds(pickId(a), pickId(b));
  });
}

module.exports = {
  naturalCompare,
  compareOfficerIds,
  compareBoothIds,
  sortByOfficerId,
  sortByBoothId,
};