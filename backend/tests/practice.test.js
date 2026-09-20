import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateCardWeight,
  orderFlashcardsForPractice,
  getDeckPracticeSummary,
  recordCardReview,
  resetPracticeDeck
} from '../src/services/practice/flashcardPracticeService.js';

describe('Flashcard Practice Mode - Deterministic Confidence Ordering', () => {
  const sampleCards = [
    {
      id: 'fc-1',
      category: 'TECHNICAL',
      frontPrompt: 'Explain event loop phases in Node.js',
      confidence: 4, // High / Mastered
      reviewCount: 3,
      isCovered: true,
      lastReviewedAt: new Date('2026-09-18T10:00:00Z'),
      order: 1
    },
    {
      id: 'fc-2',
      category: 'TECHNICAL',
      frontPrompt: 'Explain Kafka partition rebalancing strategies',
      confidence: 1, // Low / Needs Review (URGENT)
      reviewCount: 2,
      isCovered: true,
      lastReviewedAt: new Date('2026-09-19T08:00:00Z'),
      order: 2
    },
    {
      id: 'fc-3',
      category: 'SYSTEM_DESIGN',
      frontPrompt: 'Cap Theorem trade-offs in distributed caches',
      confidence: null, // Uncovered / Unseen
      reviewCount: 0,
      isCovered: false,
      lastReviewedAt: null,
      order: 3
    },
    {
      id: 'fc-4',
      category: 'BEHAVIORAL',
      frontPrompt: 'STAR response for managing technical debt pushback',
      confidence: 2, // Hard / Shaky
      reviewCount: 1,
      isCovered: true,
      lastReviewedAt: new Date('2026-09-17T12:00:00Z'),
      order: 4
    },
    {
      id: 'fc-5',
      category: 'COMPANY_FIT',
      frontPrompt: 'What are the company core values?',
      confidence: 3, // Medium / Good
      reviewCount: 2,
      isCovered: true,
      lastReviewedAt: new Date('2026-09-16T12:00:00Z'),
      order: 5
    }
  ];

  it('assigns correct deterministic priority weights', () => {
    assert.strictEqual(calculateCardWeight(sampleCards[1]), 1, 'Low confidence card should have weight 1');
    assert.strictEqual(calculateCardWeight(sampleCards[2]), 2, 'Uncovered card should have weight 2');
    assert.strictEqual(calculateCardWeight(sampleCards[3]), 3, 'Hard card should have weight 3');
    assert.strictEqual(calculateCardWeight(sampleCards[4]), 4, 'Medium card should have weight 4');
    assert.strictEqual(calculateCardWeight(sampleCards[0]), 5, 'High confidence card should have weight 5');
  });

  it('orders cards deterministically prioritizing low confidence, then uncovered, then hard, medium, high', () => {
    const ordered = orderFlashcardsForPractice(sampleCards);
    const orderedIds = ordered.map(c => c.id);

    // Expected order:
    // 1. fc-2 (Low confidence = 1)
    // 2. fc-3 (Uncovered = 2)
    // 3. fc-4 (Hard = 3)
    // 4. fc-5 (Medium = 4)
    // 5. fc-1 (High = 5)
    assert.deepStrictEqual(orderedIds, ['fc-2', 'fc-3', 'fc-4', 'fc-5', 'fc-1']);
  });

  it('resolves ties deterministically using oldest lastReviewedAt', () => {
    const twoLowCards = [
      {
        id: 'fc-recent-low',
        confidence: 1,
        isCovered: true,
        reviewCount: 1,
        lastReviewedAt: new Date('2026-09-20T05:00:00Z'),
        order: 1
      },
      {
        id: 'fc-old-low',
        confidence: 1,
        isCovered: true,
        reviewCount: 1,
        lastReviewedAt: new Date('2026-09-15T05:00:00Z'), // Older review date should come first
        order: 2
      }
    ];

    const ordered = orderFlashcardsForPractice(twoLowCards);
    assert.strictEqual(ordered[0].id, 'fc-old-low');
    assert.strictEqual(ordered[1].id, 'fc-recent-low');
  });

  it('resolves ties using original order and stable ID when timestamps match', () => {
    const tiedCards = [
      { id: 'fc-b', confidence: null, isCovered: false, reviewCount: 0, lastReviewedAt: null, order: 2 },
      { id: 'fc-a', confidence: null, isCovered: false, reviewCount: 0, lastReviewedAt: null, order: 1 }
    ];

    const ordered = orderFlashcardsForPractice(tiedCards);
    assert.strictEqual(ordered[0].id, 'fc-a');
    assert.strictEqual(ordered[1].id, 'fc-b');
  });

  it('filters by WEAK_ONLY returning only low, hard, or uncovered cards', () => {
    const weakCards = orderFlashcardsForPractice(sampleCards, { filter: 'WEAK_ONLY' });
    const weakIds = weakCards.map(c => c.id);
    assert.deepStrictEqual(weakIds, ['fc-2', 'fc-3', 'fc-4']);
  });

  it('filters by UNCOVERED_ONLY returning only unreviewed cards', () => {
    const uncoveredCards = orderFlashcardsForPractice(sampleCards, { filter: 'UNCOVERED_ONLY' });
    assert.strictEqual(uncoveredCards.length, 1);
    assert.strictEqual(uncoveredCards[0].id, 'fc-3');
  });
});

describe('Flashcard Practice Mode - Progress Persistence & Metrics', () => {
  function createTestKit() {
    return {
      version: 1,
      flashcards: [
        {
          id: 'card-1',
          frontPrompt: 'What is idempotency?',
          backKeyPoints: ['Safe retries', 'Unique transaction keys'],
          quickTip: 'Think stripe idempotency key header',
          confidence: null,
          reviewCount: 0,
          isCovered: false,
          lastReviewedAt: null,
          order: 0
        },
        {
          id: 'card-2',
          frontPrompt: 'Explain WAL in databases',
          backKeyPoints: ['Write-ahead logging', 'Durability before disk sync'],
          quickTip: 'Append-only sequential disk write',
          confidence: null,
          reviewCount: 0,
          isCovered: false,
          lastReviewedAt: null,
          order: 1
        },
        {
          id: 'card-3',
          frontPrompt: 'Explain 2-Phase Commit',
          backKeyPoints: ['Prepare phase', 'Commit phase', 'Coordinator SPOF'],
          quickTip: 'Blocking protocol',
          confidence: null,
          reviewCount: 0,
          isCovered: false,
          lastReviewedAt: null,
          order: 2
        }
      ]
    };
  }

  it('computes initial deck summary correctly for unreviewed cards', () => {
    const kit = createTestKit();
    const summary = getDeckPracticeSummary(kit.flashcards);

    assert.strictEqual(summary.totalCards, 3);
    assert.strictEqual(summary.coveredCount, 0);
    assert.strictEqual(summary.uncoveredCount, 3);
    assert.strictEqual(summary.coveragePercent, 0);
    assert.strictEqual(summary.confidenceCounts.unrated, 3);
  });

  it('persists card review rating, increments reviewCount, marks covered, and bumps version', () => {
    const kit = createTestKit();
    const beforeTime = new Date();

    const { card, summary } = recordCardReview(kit, 'card-1', { confidence: 1 });

    assert.strictEqual(card.confidence, 1);
    assert.strictEqual(card.reviewCount, 1);
    assert.strictEqual(card.isCovered, true);
    assert.ok(card.lastReviewedAt >= beforeTime);
    assert.strictEqual(kit.version, 2, 'Version should increment on review');

    // Summary should update
    assert.strictEqual(summary.coveredCount, 1);
    assert.strictEqual(summary.uncoveredCount, 2);
    assert.strictEqual(summary.coveragePercent, 33);
    assert.strictEqual(summary.confidenceCounts.low, 1);
  });

  it('validates confidence scores and throws on invalid inputs', () => {
    const kit = createTestKit();

    assert.throws(() => {
      recordCardReview(kit, 'card-1', { confidence: 0 });
    }, /Invalid confidence score/);

    assert.throws(() => {
      recordCardReview(kit, 'card-1', { confidence: 5 });
    }, /Invalid confidence score/);

    assert.throws(() => {
      recordCardReview(kit, 'non-existent-card', { confidence: 3 });
    }, /not found in kit/);
  });

  it('prioritizes low-confidence cards in subsequent practice sessions', () => {
    const kit = createTestKit();

    // Session 1:
    // Candidate reviews card-1 with Easy (4)
    // Candidate reviews card-2 with Low (1)
    // Candidate leaves card-3 unreviewed (Uncovered)
    recordCardReview(kit, 'card-1', { confidence: 4 });
    recordCardReview(kit, 'card-2', { confidence: 1 });

    // Session 2 queue generation:
    const nextSession = orderFlashcardsForPractice(kit.flashcards);

    assert.strictEqual(nextSession[0].id, 'card-2', 'Next session MUST prioritize low-confidence card-2 first');
    assert.strictEqual(nextSession[1].id, 'card-3', 'Uncovered card-3 should be second');
    assert.strictEqual(nextSession[2].id, 'card-1', 'Mastered card-1 (Easy 4) should be last');
  });

  it('resets practice progress across all cards cleanly', () => {
    const kit = createTestKit();
    recordCardReview(kit, 'card-1', { confidence: 4 });
    recordCardReview(kit, 'card-2', { confidence: 2 });
    recordCardReview(kit, 'card-3', { confidence: 3 });

    const beforeSummary = getDeckPracticeSummary(kit.flashcards);
    assert.strictEqual(beforeSummary.coveredCount, 3);
    assert.strictEqual(beforeSummary.coveragePercent, 100);

    const resetSummary = resetPracticeDeck(kit);
    assert.strictEqual(resetSummary.coveredCount, 0);
    assert.strictEqual(resetSummary.coveragePercent, 0);
    assert.strictEqual(resetSummary.confidenceCounts.unrated, 3);

    for (const card of kit.flashcards) {
      assert.strictEqual(card.confidence, null);
      assert.strictEqual(card.reviewCount, 0);
      assert.strictEqual(card.isCovered, false);
      assert.strictEqual(card.lastReviewedAt, null);
    }
  });
});
