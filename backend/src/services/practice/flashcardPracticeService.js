/**
 * Flashcard Practice Service
 * 
 * Provides deterministic confidence-weighted ordering, review state updates,
 * deck coverage summaries, and progress persistence for the Trao Flashcard Practice Mode.
 * 
 * Invariants:
 * - Deterministic: Zero random shuffling or non-deterministic ordering.
 * - Prioritization: Low-confidence (confidence = 1) cards are always reviewed first,
 *   followed by uncovered cards (reviewCount = 0), hard (2), medium (3), and high (4).
 * - Stable tie-breaking: ties are broken by oldest lastReviewedAt, original order, and lexicographical ID.
 */

/**
 * Calculates priority weight for a flashcard based on review and confidence metrics.
 * Lower weight = higher review priority.
 * 
 * Weight 1: Low Confidence / Needs Review (confidence === 1)
 * Weight 2: Uncovered / Unreviewed (isCovered === false || reviewCount === 0)
 * Weight 3: Hard / Shaky (confidence === 2)
 * Weight 4: Medium / Good (confidence === 3)
 * Weight 5: High / Easy / Mastered (confidence === 4)
 * Weight 6: Default fallback
 * 
 * @param {object} card 
 * @returns {number} Integer weight between 1 and 6
 */
export function calculateCardWeight(card) {
  if (!card) {
    return 6;
  }

  // Low confidence is highest priority (immediate active recall remediation)
  if (card.confidence === 1) {
    return 1;
  }

  // Uncovered / unreviewed material is second priority
  const isUncovered = !card.isCovered || !card.reviewCount || card.confidence === null || card.confidence === undefined;
  if (isUncovered) {
    return 2;
  }

  // Hard cards
  if (card.confidence === 2) {
    return 3;
  }

  // Medium / good cards
  if (card.confidence === 3) {
    return 4;
  }

  // High / mastered cards
  if (card.confidence === 4) {
    return 5;
  }

  return 6;
}

/**
 * Deterministically orders flashcards for practice.
 * 
 * Ordering Hierarchy:
 * 1. Weight ascending (Low -> Uncovered -> Hard -> Medium -> High)
 * 2. LastReviewedAt ascending (Oldest review first, unreviewed nulls first)
 * 3. Original order ascending (Preserves syllabus sequence)
 * 4. ID ascending (Stable tie-breaker)
 * 
 * @param {Array} flashcards Array of flashcard objects
 * @param {object} [options={}] Filtering options: { filter: 'ALL' | 'UNCOVERED_ONLY' | 'WEAK_ONLY', category?: string }
 * @returns {Array} Deterministically sorted copy of flashcards
 */
export function orderFlashcardsForPractice(flashcards = [], options = {}) {
  let deck = Array.isArray(flashcards) ? [...flashcards] : [];

  // Filter by category if specified
  if (options.category && options.category !== 'ALL') {
    deck = deck.filter(c => c.category?.toUpperCase() === options.category.toUpperCase());
  }

  // Filter by practice mode scope
  if (options.filter === 'UNCOVERED_ONLY') {
    deck = deck.filter(c => !c.isCovered || !c.reviewCount);
  } else if (options.filter === 'WEAK_ONLY') {
    deck = deck.filter(c => c.confidence === 1 || c.confidence === 2 || !c.isCovered || !c.reviewCount);
  }

  // Pure deterministic sort
  return deck.sort((a, b) => {
    const weightA = calculateCardWeight(a);
    const weightB = calculateCardWeight(b);
    if (weightA !== weightB) {
      return weightA - weightB;
    }

    // Secondary: Oldest review first
    const timeA = a.lastReviewedAt ? new Date(a.lastReviewedAt).getTime() : 0;
    const timeB = b.lastReviewedAt ? new Date(b.lastReviewedAt).getTime() : 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    // Tertiary: Original order
    const orderA = Number.isInteger(a.order) ? a.order : 0;
    const orderB = Number.isInteger(b.order) ? b.order : 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // Quaternary: Deterministic string tie-breaker
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Computes coverage statistics and confidence distribution for a deck.
 * 
 * @param {Array} flashcards 
 * @returns {object} Summary metrics
 */
export function getDeckPracticeSummary(flashcards = []) {
  const cards = Array.isArray(flashcards) ? flashcards : [];
  const totalCards = cards.length;

  let coveredCount = 0;
  const confidenceCounts = {
    low: 0,
    hard: 0,
    medium: 0,
    high: 0,
    unrated: 0
  };

  for (const card of cards) {
    const isCovered = Boolean(card.isCovered || (card.reviewCount && card.reviewCount > 0));
    if (isCovered) {
      coveredCount += 1;
    }

    if (card.confidence === 1) {
      confidenceCounts.low += 1;
    } else if (card.confidence === 2) {
      confidenceCounts.hard += 1;
    } else if (card.confidence === 3) {
      confidenceCounts.medium += 1;
    } else if (card.confidence === 4) {
      confidenceCounts.high += 1;
    } else {
      confidenceCounts.unrated += 1;
    }
  }

  const uncoveredCount = totalCards - coveredCount;
  const coveragePercent = totalCards > 0 ? Math.round((coveredCount / totalCards) * 100) : 0;

  return {
    totalCards,
    coveredCount,
    uncoveredCount,
    coveragePercent,
    confidenceCounts
  };
}

/**
 * Records a candidate's confidence review rating for a specific flashcard.
 * 
 * @param {object} kit Mongoose PrepKit document or plain object
 * @param {string} cardId ID of flashcard being reviewed
 * @param {object} reviewData { confidence: 1|2|3|4 }
 * @returns {object} { card, summary }
 */
export function recordCardReview(kit, cardId, reviewData = {}) {
  const confidence = Number(reviewData.confidence);
  if (![1, 2, 3, 4].includes(confidence)) {
    throw new Error(`Invalid confidence score "${reviewData.confidence}". Must be an integer between 1 and 4.`);
  }

  if (!Array.isArray(kit.flashcards)) {
    throw new Error('PrepKit has no flashcards array.');
  }

  const card = kit.flashcards.find(fc => fc.id === cardId);
  if (!card) {
    throw new Error(`Flashcard with ID "${cardId}" not found in kit.`);
  }

  // Update review metrics
  card.confidence = confidence;
  card.reviewCount = (card.reviewCount || 0) + 1;
  card.isCovered = true;
  card.lastReviewedAt = new Date();

  // Optimistic version bump
  kit.version = (kit.version || 1) + 1;

  const summary = getDeckPracticeSummary(kit.flashcards);

  return {
    card,
    summary
  };
}

/**
 * Resets all review progress across flashcards in a kit.
 * 
 * @param {object} kit PrepKit document
 * @returns {object} Updated summary
 */
export function resetPracticeDeck(kit) {
  if (!Array.isArray(kit.flashcards)) {
    return getDeckPracticeSummary([]);
  }

  for (const card of kit.flashcards) {
    card.confidence = null;
    card.reviewCount = 0;
    card.isCovered = false;
    card.lastReviewedAt = null;
  }

  kit.version = (kit.version || 1) + 1;
  return getDeckPracticeSummary(kit.flashcards);
}
