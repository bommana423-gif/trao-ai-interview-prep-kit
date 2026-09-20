import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkCoverage } from '../src/services/coverage/coverageChecker.js';
import { remediateCoverageGaps } from '../src/services/coverage/remediationService.js';
import { MockLlmProvider } from '../src/services/llm/providers/mockProvider.js';

describe('Deterministic Coverage Checker (Zero LLM)', () => {
  const sampleRequirements = [
    { id: 'req-tech-1', text: 'Distributed Node.js microservices', kind: 'technical', priority: 'must-have' },
    { id: 'req-tech-2', text: 'Apache Kafka streaming and rebalancing', kind: 'technical', priority: 'must-have' },
    { id: 'req-domain-1', text: 'Payment gateway idempotency', kind: 'domain', priority: 'nice-to-have' },
    { id: 'req-behav-1', text: 'Engineering mentorship and conflict resolution', kind: 'behavioral', priority: 'must-have' }
  ];

  it('correctly reports 0% coverage and all uncovered requirement IDs when no questions exist', () => {
    const result = checkCoverage(sampleRequirements, []);

    assert.strictEqual(result.coverageScore, 0);
    assert.strictEqual(result.weightedCoverageScore, 0);
    assert.strictEqual(result.isFullyCovered, false);
    assert.deepStrictEqual(result.covered_requirement_ids, []);
    assert.deepStrictEqual(result.uncovered_requirement_ids, ['req-tech-1', 'req-tech-2', 'req-domain-1', 'req-behav-1']);
    assert.deepStrictEqual(result.uncovered_must_haves, ['req-tech-1', 'req-tech-2', 'req-behav-1']);
  });

  it('correctly computes partial coverage and partitions covered vs uncovered requirements', () => {
    const questions = [
      {
        id: 'q-1',
        question: 'Explain Kafka partition assignors in Node.js',
        targetRequirementIds: ['req-tech-1', 'req-tech-2']
      }
    ];

    const result = checkCoverage(sampleRequirements, questions);

    // 2 out of 4 covered = 50%
    assert.strictEqual(result.coverageScore, 50);
    assert.strictEqual(result.isFullyCovered, false);
    assert.deepStrictEqual(result.covered_requirement_ids.sort(), ['req-tech-1', 'req-tech-2'].sort());
    assert.deepStrictEqual(result.uncovered_requirement_ids.sort(), ['req-domain-1', 'req-behav-1'].sort());
    assert.deepStrictEqual(result.uncovered_must_haves, ['req-behav-1']);

    // Inverted index maps properly
    assert.deepStrictEqual(result.requirementCoverageMap['req-tech-1'].questionIds, ['q-1']);
    assert.deepStrictEqual(result.requirementCoverageMap['req-tech-2'].questionIds, ['q-1']);
    assert.deepStrictEqual(result.requirementCoverageMap['req-domain-1'].questionIds, []);
  });

  it('reports 100% full coverage when all requirements are mapped to questions', () => {
    const questions = [
      { id: 'q-1', targetRequirementIds: ['req-tech-1', 'req-tech-2'] },
      { id: 'q-2', targetRequirementIds: ['req-domain-1'] },
      { id: 'q-3', targetRequirementIds: ['req-behav-1'] }
    ];

    const result = checkCoverage(sampleRequirements, questions);

    assert.strictEqual(result.coverageScore, 100);
    assert.strictEqual(result.weightedCoverageScore, 100);
    assert.strictEqual(result.isFullyCovered, true);
    assert.strictEqual(result.uncovered_requirement_ids.length, 0);
    assert.strictEqual(result.uncovered_must_haves.length, 0);
  });

  it('never modifies or counts non-existent requirement IDs referenced in questions', () => {
    const questions = [
      { id: 'q-rogue', targetRequirementIds: ['req-hallucinated-99', 'req-tech-1'] }
    ];

    const result = checkCoverage(sampleRequirements, questions);

    assert.deepStrictEqual(result.covered_requirement_ids, ['req-tech-1']);
    assert.strictEqual(result.requirementCoverageMap['req-hallucinated-99'], undefined);
  });
});

describe('Coverage Remediation Loop & Honest Gap Preservation', () => {
  const sampleRequirements = [
    { id: 'req-tech-1', text: 'Distributed Node.js microservices', kind: 'technical', priority: 'must-have' },
    { id: 'req-tech-2', text: 'Apache Kafka streaming and rebalancing', kind: 'technical', priority: 'must-have' },
    { id: 'req-domain-1', text: 'Payment gateway idempotency', kind: 'domain', priority: 'nice-to-have' }
  ];

  it('skips remediation if the kit is already fully covered', async () => {
    const fullyCoveredQuestions = [
      { id: 'q-1', targetRequirementIds: ['req-tech-1', 'req-tech-2'] },
      { id: 'q-2', targetRequirementIds: ['req-domain-1'] }
    ];

    const mockProvider = new MockLlmProvider();
    const result = await remediateCoverageGaps({
      requirements: sampleRequirements,
      existingQuestions: fullyCoveredQuestions,
      provider: mockProvider,
      maxPasses: 1
    });

    assert.strictEqual(result.status, 'FULL_COVERAGE');
    assert.strictEqual(result.passesExecuted, 0);
    assert.strictEqual(result.remediatedQuestions.length, 0);
    assert.strictEqual(mockProvider.callHistory.length, 0); // Proves zero unnecessary LLM calls
  });

  it('generates missing questions strictly for uncovered requirements and verifies in second pass', async () => {
    // Initially missing req-domain-1
    const partiallyCovered = [
      { id: 'q-1', targetRequirementIds: ['req-tech-1', 'req-tech-2'] }
    ];

    const mockProvider = new MockLlmProvider();
    // Program provider to return targeted question for req-domain-1
    mockProvider.registerHandler('UNCOVERED REQUIREMENTS', ({ userPrompt }) => {
      assert.ok(userPrompt.includes('req-domain-1'));
      assert.ok(!userPrompt.includes('req-tech-1')); // Must NOT ask for already covered requirements

      return JSON.stringify({
        questions: [
          {
            id: 'q-remediated-domain-1',
            question: 'How do you design database idempotency keys for payment gateway webhook delivery?',
            targetRequirementIds: ['req-domain-1'],
            category: 'TECHNICAL_DEEP_DIVE',
            difficulty: 'SENIOR',
            estimatedMinutes: 20
          }
        ]
      });
    });

    const result = await remediateCoverageGaps({
      requirements: sampleRequirements,
      existingQuestions: partiallyCovered,
      provider: mockProvider,
      maxPasses: 1
    });

    assert.strictEqual(result.status, 'REMEDIATED');
    assert.strictEqual(result.passesExecuted, 1);
    assert.strictEqual(result.coverageScore, 100);
    assert.strictEqual(result.remediatedQuestions.length, 1);
    assert.strictEqual(result.remediatedQuestions[0].id, 'q-remediated-domain-1');
    assert.strictEqual(result.allQuestions.length, 2);
  });

  it('limits correction passes and honestly identifies remaining gaps if LLM fails to cover them', async () => {
    // Missing req-tech-2 and req-domain-1
    const initialQuestions = [
      { id: 'q-1', targetRequirementIds: ['req-tech-1'] }
    ];

    const mockProvider = new MockLlmProvider();
    // Simulate LLM only covering req-tech-2 but failing to generate for req-domain-1
    mockProvider.registerHandler('UNCOVERED REQUIREMENTS', () => {
      return JSON.stringify({
        questions: [
          {
            id: 'q-partial-fix',
            question: 'How does Kafka consumer rebalancing work?',
            targetRequirementIds: ['req-tech-2'],
            category: 'TECHNICAL_DEEP_DIVE',
            difficulty: 'SENIOR',
            estimatedMinutes: 20
          }
        ]
      });
    });

    const result = await remediateCoverageGaps({
      requirements: sampleRequirements,
      existingQuestions: initialQuestions,
      provider: mockProvider,
      maxPasses: 1 // Cap to 1 pass
    });

    // Proves honest gap preservation
    assert.strictEqual(result.status, 'PARTIALLY_REMEDIATED');
    assert.strictEqual(result.passesExecuted, 1);
    assert.strictEqual(result.uncovered_requirement_ids.length, 1);
    assert.deepStrictEqual(result.uncovered_requirement_ids, ['req-domain-1']);
    assert.strictEqual(result.remainingGaps.length, 1);
    assert.strictEqual(result.remainingGaps[0].id, 'req-domain-1');
    assert.ok(result.coverageScore < 100);
  });
});
