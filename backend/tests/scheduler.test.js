import { describe, it } from 'node:test';
import assert from 'node:assert';
import { allocateSchedule, prioritizeQuestions } from '../src/services/scheduler/scheduleAllocator.js';

describe('Deterministic Schedule Allocator', () => {
  const sampleRequirements = [
    { id: 'req-tech-1', text: 'Distributed Node.js microservices', kind: 'technical', priority: 'must-have' },
    { id: 'req-tech-2', text: 'Apache Kafka streaming and rebalancing', kind: 'technical', priority: 'must-have' },
    { id: 'req-domain-1', text: 'Payment gateway idempotency', kind: 'domain', priority: 'nice-to-have' },
    { id: 'req-behav-1', text: 'Engineering mentorship and conflict resolution', kind: 'behavioral', priority: 'must-have' }
  ];

  const sampleQuestions = [
    {
      id: 'q-sys-1',
      question: 'Design a high-throughput distributed payment ledger',
      category: 'SYSTEM_DESIGN',
      difficulty: 'STAFF',
      targetRequirementIds: ['req-tech-1', 'req-tech-2'],
      estimatedMinutes: 30
    },
    {
      id: 'q-tech-1',
      question: 'Deep dive into Kafka cooperative sticky assignors',
      category: 'TECHNICAL_DEEP_DIVE',
      difficulty: 'SENIOR',
      targetRequirementIds: ['req-tech-2'],
      estimatedMinutes: 20
    },
    {
      id: 'q-behav-1',
      question: 'Describe navigating technical disagreement with product management',
      category: 'BEHAVIORAL',
      difficulty: 'SENIOR',
      targetRequirementIds: ['req-behav-1'],
      estimatedMinutes: 15
    },
    {
      id: 'q-fit-1',
      question: 'How do you approach payment reliability and incident post-mortems?',
      category: 'COMPANY_SPECIFIC',
      difficulty: 'MID',
      targetRequirementIds: ['req-domain-1'],
      estimatedMinutes: 15
    },
    {
      id: 'q-code-1',
      question: 'Implement an LRU cache with concurrency locks',
      category: 'CODING',
      difficulty: 'MID',
      targetRequirementIds: ['req-tech-1'],
      estimatedMinutes: 25
    }
  ];

  it('prioritizes must-have and harder questions earlier in the order', () => {
    const sorted = prioritizeQuestions(sampleQuestions, sampleRequirements);

    // 1. Must-have questions come before nice-to-have only questions
    const mustHaveQuestions = sorted.filter(q => 
      q.targetRequirementIds.some(id => 
        sampleRequirements.find(r => r.id === id)?.priority === 'must-have'
      )
    );
    const niceToHaveOnlyQuestions = sorted.filter(q => 
      !q.targetRequirementIds.some(id => 
        sampleRequirements.find(r => r.id === id)?.priority === 'must-have'
      )
    );

    assert.ok(sorted.indexOf(mustHaveQuestions[0]) < sorted.indexOf(niceToHaveOnlyQuestions[0]));

    // 2. Staff (STAFF: 4) comes before Senior (SENIOR: 3) within must-haves
    assert.strictEqual(sorted[0].id, 'q-sys-1'); // Staff + System Design + Must-have
    assert.strictEqual(sorted[0].difficulty, 'STAFF');
  });

  it('handles 1 day edge case: exactly 1 day with all questions and integer minutes', () => {
    const schedule = allocateSchedule({
      questions: sampleQuestions,
      requirements: sampleRequirements,
      totalDays: 1
    });

    assert.strictEqual(schedule.length, 1);
    const day1 = schedule[0];
    assert.strictEqual(day1.day, 1);
    assert.ok(day1.focus.length > 0);
    assert.strictEqual(day1.question_ids.length, sampleQuestions.length);
    assert.ok(Number.isInteger(day1.allocatedMinutes));
    assert.strictEqual(day1.allocatedMinutes, 30 + 20 + 15 + 15 + 25); // exactly 105

    // Must-have requirements must all appear on Day 1
    const mustHaveIds = sampleRequirements.filter(r => r.priority === 'must-have').map(r => r.id);
    for (const mId of mustHaveIds) {
      assert.ok(day1.mustHaveCoverage.includes(mId));
    }
  });

  it('handles standard 7 days: exactly 7 days, every must-have appears, integer minutes', () => {
    const schedule = allocateSchedule({
      questions: sampleQuestions,
      requirements: sampleRequirements,
      totalDays: 7
    });

    assert.strictEqual(schedule.length, 7);

    const allScheduledMustHaves = new Set();
    schedule.forEach((day, idx) => {
      assert.strictEqual(day.day, idx + 1);
      assert.ok(day.focus && typeof day.focus === 'string');
      assert.ok(Array.isArray(day.question_ids));
      assert.ok(Number.isInteger(day.allocatedMinutes));
      assert.ok(day.allocatedMinutes >= 0);

      (day.mustHaveCoverage || []).forEach(id => allScheduledMustHaves.add(id));
    });

    // Every must-have requirement must appear somewhere in the schedule
    const requiredMustHaves = sampleRequirements.filter(r => r.priority === 'must-have').map(r => r.id);
    for (const mId of requiredMustHaves) {
      assert.ok(allScheduledMustHaves.has(mId), `Must-have requirement "${mId}" did not appear in the 7-day schedule`);
    }

    // Must-have and harder questions appear earlier: Day 1 should have q-sys-1 (Staff, must-have)
    assert.ok(schedule[0].question_ids.includes('q-sys-1'));
  });

  it('handles 60 days edge case: exactly 60 days, integer minutes, spaced review', () => {
    const schedule = allocateSchedule({
      questions: sampleQuestions,
      requirements: sampleRequirements,
      totalDays: 60
    });

    assert.strictEqual(schedule.length, 60);

    const allScheduledMustHaves = new Set();
    let reviewDaysCount = 0;

    schedule.forEach((day, idx) => {
      assert.strictEqual(day.day, idx + 1);
      assert.ok(day.focus && day.focus.length > 5);
      assert.ok(Array.isArray(day.question_ids));
      assert.ok(Number.isInteger(day.allocatedMinutes));
      assert.ok(day.allocatedMinutes >= 0);

      if (day.isReviewDay) {
        reviewDaysCount++;
      }

      (day.mustHaveCoverage || []).forEach(id => allScheduledMustHaves.add(id));
    });

    // Verify all must-haves appear in 60-day schedule
    const requiredMustHaves = sampleRequirements.filter(r => r.priority === 'must-have').map(r => r.id);
    for (const mId of requiredMustHaves) {
      assert.ok(allScheduledMustHaves.has(mId));
    }

    // Proves spaced repetition: there are scheduled review days
    assert.ok(reviewDaysCount > 0);
    // Earlier days contain the hardest and must-have questions
    assert.ok(schedule[0].question_ids.includes('q-sys-1'));
  });

  it('handles arbitrary horizons (3, 14, 30 days) with exact day count and integer arithmetic', () => {
    for (const days of [3, 14, 30]) {
      const schedule = allocateSchedule({
        questions: sampleQuestions,
        requirements: sampleRequirements,
        totalDays: days
      });

      assert.strictEqual(schedule.length, days, `Expected schedule to have length ${days}`);
      for (const day of schedule) {
        assert.ok(Number.isInteger(day.allocatedMinutes));
        assert.ok(day.focus);
      }
    }
  });
});
