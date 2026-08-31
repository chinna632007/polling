/**
 * Helpers shared by the allocation table and the notification page.
 */

/** Lowercase + trim for conflict checks. */
function clean(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Classifies an allocation as an "invalid address" case when the officer and
 * booth share the same locality - the exact situation the system must avoid.
 */
export function isInvalidAddressAllocation(allocation) {
  const officerLocality = clean(allocation.officer?.locality);
  const boothLocality = clean(allocation.booth?.locality);
  return Boolean(officerLocality && boothLocality && officerLocality === boothLocality);
}

/** Human readable compatibility label used in the Allocation table. */
export function addressCompatibilityLabel(allocation) {
  const score = Number(allocation.addressMatchScore || 0);
  if (isInvalidAddressAllocation(allocation)) {
    return { label: 'Conflict', tone: 'red', score };
  }
  if (score >= 50) return { label: 'High Risk', tone: 'red', score };
  if (score >= 25) return { label: 'Moderate', tone: 'amber', score };
  return { label: 'Compatible', tone: 'green', score };
}

/** Safe address preview. */
export function localityLine(obj) {
  const parts = [obj?.locality, obj?.ward ? `Ward ${obj.ward}` : ''].filter(Boolean);
  return parts.join(', ') || '—';
}

export default { isInvalidAddressAllocation, addressCompatibilityLabel, localityLine };