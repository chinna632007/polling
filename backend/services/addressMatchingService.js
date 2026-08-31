/**
 * addressMatchingService.js
 * ==========================
 * Reusable, pure address comparison engine used by the allocation
 * algorithm to decide whether an officer's residential address is
 * "related to" a polling booth's address.
 *
 * Rules implemented here (from the project specification):
 *   1. Officer and booth MUST belong to the same Mandal.
 *   2. If officer locality matches booth locality -> reject.
 *   3. If overall address similarity is high -> reject.
 *   4. Normalize address text (lowercase, trim, strip punctuation).
 *   5. Compare important address tokens.
 *   6. If multiple important tokens match -> reject.
 *   7. PIN code alone NEVER rejects (multiple booths share a PIN).
 *
 * The module is intentionally dependency-free so it can be unit tested
 * and reused by any other part of the system.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'near', 'opp', 'opposite', 'beside', 'behind', 'in', 'at', 'the', 'and', 'or',
  'road', 'rd', 'colony', 'village', 'grama', 'street', 'st', 'nagar', 'gnr',
  'hno', 'hno.', 'no', 'district', 'dist', 'mandal', 'mdt', 'pincode', 'pin',
  'post', 'po', 'via', 'c/o', 'careof', 'nearby', 'besides', 'next', 'of',
]);

// Weights used to build a 0-100 conflict confidence score.
// Higher score = higher address conflict = less suitable.
const FIELD_WEIGHTS = {
  locality: 60, // exact locality match is the strongest signal
  localityStrong: 50, // strong similarity (token overlap / fuzzy similarity)
  wardExact: 12,
  wardStrong: 6,
  streetExact: 12,
  streetStrong: 6,
  districtExact: 5,
  pinExact: 5,
};

// Similarity ratio above which two strings are treated as "strong match".
const STRONG_SIMILARITY = 0.75;

// Conflict score at/above which the allocation is rejected.
const REJECT_SCORE = 50;

const IMPORTANT_FIELDS = ['locality', 'street', 'ward'];

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a single piece of address text:
 *  - Unicode normalize
 *  - lowercase
 *  - strip punctuation (. , # / & ( ) ' " -)
 *  - collapse whitespace
 */
function normalizeAddress(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,#/&()'"\-–—|\\;:_*^%$@!?+=<>[\]{}~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits normalized text into meaningful tokens, ignoring stopwords and
 * tokens that are too short to carry meaning.
 */
function tokenizeAddress(text) {
  const normalized = normalizeAddress(text);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}
/**
 * Levenshtein edit-distance (iterative, O(n*m)) used for fuzzy matching of
 * locality names that may be spelled slightly differently in the two files.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Similarity ratio in [0,1]. 1 = identical, 0 = completely different.
 */
function similarityRatio(a, b) {
  const sa = normalizeAddress(a);
  const sb = normalizeAddress(b);
  if (!sa && !sb) return 0;
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const dist = levenshtein(sa, sb);
  return 1 - dist / Math.max(sa.length, sb.length);
}

/**
 * Computes the exact/strong/token-match status between two address fields.
 */
function compareFields(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return { exact: false, strong: false, sharedTokens: [] };

  const exact = na === nb;
  const tokensA = tokenizeAddress(na);
  const tokensB = tokenizeAddress(nb);
  const sharedTokens = tokensA.filter((t) => tokensB.includes(t));
  const strong = exact || similarityRatio(na, nb) >= STRONG_SIMILARITY || sharedTokens.length > 0;

  return { exact, strong, sharedTokens };
}

/**
 * Mandal comparison is used as a hard gate: an officer may only be allocated
 * to a booth inside their own Mandal. A fuzzy match tolerates minor spelling
 * variations between the officer file and the booth file.
 */
function compareMandal(officerMandal, boothMandal) {
  const a = normalizeAddress(officerMandal);
  const b = normalizeAddress(boothMandal);
  if (!a || !b) return { matched: true, confidence: 0 }; // cannot disprove
  if (a === b) return { matched: true, confidence: 1 };
  const sim = similarityRatio(a, b);
  return { matched: sim >= STRONG_SIMILARITY, confidence: sim };
}

/**
 * Normalized, human friendly Mandal key used to group officers and booths.
 */
function mandalKey(mandal) {
  return normalizeAddress(mandal) || 'unknown';
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Decides whether an officer address is "related to" a booth address.
 *
 * @param {object} officer - { locality, ward, street, mandal, district, pinCode }
 * @param {object} booth   - { locality, ward, street, mandal, district, pinCode }
 * @returns {{
 *   related: boolean,
 *   score: number,          // 0-100 conflict confidence
 *   mandalMatched: boolean,
 *   matchedTokens: string[],// important shared locality/street/ward tokens
 *   reasons: string[]       // human readable reasons for the decision
 * }}
 */
function isRelated(officer, booth) {
  const reasons = [];

  // --- Hard gate: same Mandal is mandatory (rule 1) -------------------------
  const mandalCheck = compareMandal(officer.mandal, booth.mandal);
  if (!mandalCheck.matched) {
    return {
      related: true,
      score: 100,
      mandalMatched: false,
      matchedTokens: [],
      reasons: ['Different Mandal - not eligible for this booth'],
    };
  }

  // --- Compare every important field -----------------------------------------
  const fieldResults = {};
  const matchedTokens = new Set();

  IMPORTANT_FIELDS.forEach((field) => {
    const res = compareFields(officer[field], booth[field]);
    fieldResults[field] = res;
    res.sharedTokens.forEach((t) => matchedTokens.add(t));
  });

  const districtRes = compareFields(officer.district, booth.district);
  const pinRes = compareFields(officer.pinCode, booth.pinCode);

  const localityExact = fieldResults.locality.exact;
  const localityStrong = fieldResults.locality.strong;
  const wardExact = fieldResults.ward.exact;
  const wardStrong = fieldResults.ward.strong;
  const streetExact = fieldResults.street.exact;
  const streetStrong = fieldResults.street.strong;

  const strongImportantCount = IMPORTANT_FIELDS.filter((f) => fieldResults[f].strong).length;

  // --- Rule 2: locality match (exact) always rejects ------------------------
  if (localityExact) {
    reasons.push(`Locality matches exactly: ${officer.locality}`);
  } else if (localityStrong) {
    reasons.push('Locality is highly similar to the booth locality');
  }

  // --- Rule 6: multiple important token matches reject ----------------------
  if (matchedTokens.size >= 2) {
    reasons.push(`Multiple address tokens match (${[...matchedTokens].join(', ')})`);
  }

  // --- Rule 3: high overall similarity between street/ward rejects ----------
  if (wardExact && streetExact) {
    reasons.push('Ward and street both match exactly');
  }
  if (strongImportantCount >= 2 && !localityExact) {
    reasons.push(`High address similarity across ${strongImportantCount} fields`);
  }

  // --- Compute conflict confidence score --------------------------------------
  let score = 0;
  if (localityExact) score += FIELD_WEIGHTS.locality;
  else if (localityStrong) score += FIELD_WEIGHTS.localityStrong;
  if (wardExact) score += FIELD_WEIGHTS.wardExact;
  else if (wardStrong) score += FIELD_WEIGHTS.wardStrong;
  if (streetExact) score += FIELD_WEIGHTS.streetExact;
  else if (streetStrong) score += FIELD_WEIGHTS.streetStrong;
  if (districtRes.exact) score += FIELD_WEIGHTS.districtExact; // minor signal only
  if (pinRes.exact) score += FIELD_WEIGHTS.pinExact; // NEVER decisive alone (rule 7)
  score = Math.min(100, Math.max(0, score));

  // --- Decision -----------------------------------------------------------------
  const related = score >= REJECT_SCORE || !mandalCheck.matched;

  if (!related) {
    reasons.length = 0;
    reasons.push('No significant address conflict detected');
  }

  return {
    related,
    score,
    mandalMatched: true,
    matchedTokens: [...matchedTokens],
    reasons,
  };
}

/**
 * Convenience wrapper used by the allocation service: returns true when the
 * booth must NOT receive this officer.
 */
function isAllocationBlocked(officer, booth) {
  return isRelated(officer, booth).related;
}

/**
 * Builds a one-line readable booth address used in SMS / reports.
 */
function boothAddressLine(booth) {
  return [
    booth.buildingName,
    booth.street,
    booth.locality,
    booth.ward ? `Ward ${booth.ward}` : '',
    booth.mandal,
    booth.district,
    booth.pinCode ? `PIN ${booth.pinCode}` : '',
  ]
    .filter((part) => part && String(part).trim())
    .join(', ');
}

module.exports = {
  STOPWORDS,
  FIELD_WEIGHTS,
  STRONG_SIMILARITY,
  REJECT_SCORE,
  normalizeAddress,
  tokenizeAddress,
  levenshtein,
  similarityRatio,
  compareFields,
  compareMandal,
  mandalKey,
  isRelated,
  isAllocationBlocked,
  boothAddressLine,
};