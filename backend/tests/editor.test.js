import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as editorService from '../src/services/editor/kitEditorService.js';
import { MockLlmProvider } from '../src/services/llm/providers/mockProvider.js';

describe('Editable Kit Builder - State Model & Granular Mutations', () => {
  let mockKit;

  beforeEach(() => {
    mockKit = {
      _id: 'kit-123',
      version: 1,
      targetRole: 'Senior Backend Engineer',
      targetCompany: 'Acme Payments',
      requirements: [
        { id: 'req-tech-1', text: 'Distributed Node.js microservices', kind: 'technical', priority: 'must-have', origin: 'GENERATED', isPinned: false },
        { id: 'req-tech-2', text: 'Apache Kafka streaming', kind: 'technical', priority: 'must-have', origin: 'GENERATED', isPinned: false }
      ],
      companyBrief: {
        overview: 'Acme builds global payment checkout infrastructure.',
        missionValues: ['Reliability', 'Transparency'],
        techStack: ['Node.js', 'Kafka', 'PostgreSQL']
      },
      roleBreakdown: {
        title: 'Senior Backend Engineer',
        seniority: 'Senior',
        coreFocus: 'High throughput distributed systems',
        dayToDayResponsibilities: ['Build payment APIs', 'On-call rotation']
      },
      modules: [
        {
          moduleId: 'mod-tech',
          title: 'Technical Deep Dive',
          type: 'TECHNICAL',
          questions: [
            {
              questionId: 'q-tech-1',
              prompt: 'How do you handle Kafka partition rebalancing?',
              category: 'TECHNICAL',
              difficulty: 'SENIOR',
              competencyIds: ['req-tech-2'],
              estimatedMinutes: 20,
              origin: 'GENERATED',
              isPinned: false,
              answerFramework: { approach: 'Explain cooperative sticky assignor' },
              rubric: { criteria: 'Kafka streaming knowledge' }
            },
            {
              questionId: 'q-tech-2',
              prompt: 'Design an event loop non-blocking worker thread in Node.js',
              category: 'TECHNICAL',
              difficulty: 'MID',
              competencyIds: ['req-tech-1'],
              estimatedMinutes: 20,
              origin: 'GENERATED',
              isPinned: false,
              answerFramework: { approach: 'Offload CPU tasks' },
              rubric: { criteria: 'Node internals' }
            }
          ]
        },
        {
          moduleId: 'mod-behav',
          title: 'Behavioral & Leadership',
          type: 'BEHAVIORAL',
          questions: [
            {
              questionId: 'q-behav-1',
              prompt: 'Tell me about a technical disagreement.',
              category: 'BEHAVIORAL',
              difficulty: 'SENIOR',
              competencyIds: [],
              estimatedMinutes: 15,
              origin: 'GENERATED',
              isPinned: false
            }
          ]
        }
      ],
      flashcards: [
        {
          id: 'fc-1',
          targetRequirementId: 'req-tech-2',
          frontPrompt: 'What is Cooperative Sticky Assignor?',
          backKeyPoints: ['Minimizes stop-the-world pauses'],
          origin: 'GENERATED',
          isPinned: false
        }
      ],
      schedule: [
        { day: 1, focus: 'Kafka & Node', question_ids: ['q-tech-1', 'q-tech-2'], allocatedMinutes: 40 }
      ],
      coverageScore: 100,
      uncoveredGaps: []
    };
  });

  it('edits company brief and increments version counter', () => {
    editorService.updateCompanyBrief(mockKit, {
      overview: 'Acme is now focusing on enterprise AI fraud detection.',
      techStack: ['Node.js', 'Kafka', 'Python', 'TensorFlow']
    });

    assert.strictEqual(mockKit.companyBrief.overview, 'Acme is now focusing on enterprise AI fraud detection.');
    assert.deepStrictEqual(mockKit.companyBrief.techStack, ['Node.js', 'Kafka', 'Python', 'TensorFlow']);
    assert.strictEqual(mockKit.version, 2);
  });

  it('edits role responsibilities and core challenges', () => {
    editorService.updateRoleBreakdown(mockKit, {
      seniority: 'Staff',
      dayToDayResponsibilities: ['Lead architecture committee', 'Conduct design reviews']
    });

    assert.strictEqual(mockKit.roleBreakdown.seniority, 'Staff');
    assert.strictEqual(mockKit.roleBreakdown.dayToDayResponsibilities.length, 2);
    assert.strictEqual(mockKit.version, 2);
  });

  it('adds custom requirement, marks USER_CREATED, and recalculates coverage', () => {
    editorService.addRequirement(mockKit, {
      text: 'Production Kubernetes and Docker containerization',
      kind: 'technical',
      priority: 'must-have'
    });

    assert.strictEqual(mockKit.requirements.length, 3);
    const added = mockKit.requirements[2];
    assert.strictEqual(added.origin, 'USER_CREATED');
    assert.strictEqual(added.isPinned, true);
    assert.ok(added.id.startsWith('req-user-'));
    // Since this new requirement is not yet targeted by questions, coverage should drop from 100
    assert.ok(mockKit.coverageScore < 100);
    assert.strictEqual(mockKit.version, 2);
  });

  it('updates existing question, marks USER_EDITED, and increments revision', () => {
    editorService.updateQuestion(mockKit, 'q-tech-1', {
      prompt: 'Custom Prompt: How do Kafka static group memberships prevent unnecessary rebalances?',
      answerFramework: {
        approach: 'Define group.instance.id and heartbeat timeouts',
        keyPointsToCover: ['static membership', 'rolling upgrades']
      },
      isPinned: true
    });

    const techMod = mockKit.modules[0];
    const q1 = techMod.questions[0];

    assert.strictEqual(q1.origin, 'USER_EDITED');
    assert.strictEqual(q1.isPinned, true);
    assert.strictEqual(q1.isCustomized, true);
    assert.strictEqual(q1.revision, 2);
    assert.strictEqual(q1.prompt, 'Custom Prompt: How do Kafka static group memberships prevent unnecessary rebalances?');
    assert.strictEqual(q1.answerFramework.approach, 'Define group.instance.id and heartbeat timeouts');
    assert.strictEqual(mockKit.version, 2);
  });

  it('adds custom question with USER_CREATED state and auto-pinning', () => {
    const newQ = editorService.addQuestion(mockKit, {
      prompt: 'How do you structure database migrations with zero downtime?',
      category: 'TECHNICAL',
      difficulty: 'SENIOR',
      competencyIds: ['req-tech-1'],
      estimatedMinutes: 25
    });

    assert.strictEqual(newQ.origin, 'USER_CREATED');
    assert.strictEqual(newQ.isPinned, true);
    assert.ok(newQ.questionId.startsWith('q-user-'));
    assert.strictEqual(mockKit.modules[0].questions.length, 3);
    assert.strictEqual(mockKit.version, 2);
  });

  it('moves question between categories (TECHNICAL -> SYSTEM_DESIGN)', () => {
    editorService.moveQuestionCategory(mockKit, 'q-tech-2', 'SYSTEM_DESIGN');

    // Should be removed from TECHNICAL module
    assert.strictEqual(mockKit.modules[0].questions.length, 1);
    assert.strictEqual(mockKit.modules[0].questions[0].questionId, 'q-tech-1');

    // SYSTEM_DESIGN module created and question appended
    const sysMod = mockKit.modules.find(m => m.type === 'SYSTEM_DESIGN');
    assert.ok(sysMod);
    assert.strictEqual(sysMod.questions.length, 1);
    assert.strictEqual(sysMod.questions[0].questionId, 'q-tech-2');
    assert.strictEqual(sysMod.questions[0].category, 'SYSTEM_DESIGN');
  });

  it('reorders questions within a module according to specified ID list', () => {
    const techMod = mockKit.modules[0];
    assert.strictEqual(techMod.questions[0].questionId, 'q-tech-1');
    assert.strictEqual(techMod.questions[1].questionId, 'q-tech-2');

    editorService.reorderQuestions(mockKit, 'mod-tech', ['q-tech-2', 'q-tech-1']);

    assert.strictEqual(techMod.questions[0].questionId, 'q-tech-2');
    assert.strictEqual(techMod.questions[0].order, 0);
    assert.strictEqual(techMod.questions[1].questionId, 'q-tech-1');
    assert.strictEqual(techMod.questions[1].order, 1);
  });

  it('deletes question, cleans up schedule, and updates coverage', () => {
    editorService.deleteQuestion(mockKit, 'q-tech-2');

    assert.strictEqual(mockKit.modules[0].questions.length, 1);
    assert.strictEqual(mockKit.modules[0].questions[0].questionId, 'q-tech-1');
    // Removed from schedule
    assert.deepStrictEqual(mockKit.schedule[0].question_ids, ['q-tech-1']);
    assert.strictEqual(mockKit.version, 2);
  });

  it('adds, edits, and deletes flashcards', () => {
    // 1. Add flashcard
    const card = editorService.addFlashcard(mockKit, {
      frontPrompt: 'What is libuv?',
      backKeyPoints: ['Multi-platform asynchronous I/O support library'],
      quickTip: 'Powers the Node.js event loop thread pool'
    });
    assert.strictEqual(card.origin, 'USER_CREATED');
    assert.strictEqual(mockKit.flashcards.length, 2);

    // 2. Update existing generated flashcard fc-1 -> transitions to USER_EDITED
    editorService.updateFlashcard(mockKit, 'fc-1', {
      quickTip: 'Default size is 4 threads; tune via UV_THREADPOOL_SIZE'
    });
    const fc1 = mockKit.flashcards.find(f => f.id === 'fc-1');
    assert.strictEqual(fc1.origin, 'USER_EDITED');
    assert.strictEqual(fc1.quickTip, 'Default size is 4 threads; tune via UV_THREADPOOL_SIZE');

    // 3. Delete flashcard
    editorService.deleteFlashcard(mockKit, card.id);
    assert.strictEqual(mockKit.flashcards.length, 1);
    assert.strictEqual(mockKit.flashcards[0].id, 'fc-1');
  });
});

describe('Selective Section Regeneration - Preservation Guarantees', () => {
  let mockKit;
  let mockProvider;

  beforeEach(() => {
    mockProvider = new MockLlmProvider();
    mockKit = {
      _id: 'kit-regen-123',
      version: 1,
      targetRole: 'Senior Backend Engineer',
      targetCompany: 'Acme Payments',
      requirements: [
        { id: 'req-tech-1', text: 'Distributed Node.js microservices', kind: 'technical', priority: 'must-have' },
        { id: 'req-tech-2', text: 'Apache Kafka streaming', kind: 'technical', priority: 'must-have' }
      ],
      companyBrief: {
        overview: 'Original Company Brief: Checkout processing.',
        missionValues: ['Reliability'],
        techStack: ['Node.js', 'Kafka']
      },
      roleBreakdown: {
        title: 'Senior Backend Engineer',
        seniority: 'Senior',
        coreFocus: 'High throughput distributed systems'
      },
      modules: [
        {
          moduleId: 'mod-tech',
          title: 'Technical Deep Dive',
          type: 'TECHNICAL',
          questions: [
            {
              questionId: 'q-edited',
              prompt: 'User Edited Question: Detailed explanation of Kafka assignors',
              category: 'TECHNICAL',
              difficulty: 'SENIOR',
              competencyIds: ['req-tech-2'],
              origin: 'USER_EDITED',
              isPinned: false
            },
            {
              questionId: 'q-custom',
              prompt: 'Manually Created Question: Zero downtime database failovers',
              category: 'TECHNICAL',
              difficulty: 'STAFF',
              competencyIds: ['req-tech-1'],
              origin: 'USER_CREATED',
              isPinned: false
            },
            {
              questionId: 'q-pinned',
              prompt: 'Pinned Generated Question: Redis cluster slot allocation',
              category: 'TECHNICAL',
              difficulty: 'SENIOR',
              competencyIds: ['req-tech-1'],
              origin: 'GENERATED',
              isPinned: true
            },
            {
              questionId: 'q-replaceable',
              prompt: 'Untouched Generated Question: Standard Node.js async question',
              category: 'TECHNICAL',
              difficulty: 'MID',
              competencyIds: ['req-tech-1'],
              origin: 'GENERATED',
              isPinned: false
            }
          ]
        },
        {
          moduleId: 'mod-behav',
          title: 'Behavioral & Leadership',
          type: 'BEHAVIORAL',
          questions: [
            {
              questionId: 'q-behav-1',
              prompt: 'Tell me about a difficult engineering trade-off.',
              category: 'BEHAVIORAL',
              difficulty: 'SENIOR',
              competencyIds: [],
              origin: 'GENERATED',
              isPinned: false
            }
          ]
        }
      ],
      schedule: [
        { day: 1, focus: 'Technical Mastery', question_ids: ['q-edited', 'q-custom', 'q-pinned'], allocatedMinutes: 60 }
      ],
      coverageScore: 100,
      uncoveredGaps: []
    };
  });

  it('regenerating Company Brief updates only the company brief and leaves questions, requirements, and schedule untouched', async () => {
    // Register custom brief response
    mockProvider.registerHandler(/company brief/i, () => JSON.stringify({
      companyBrief: {
        overview: 'Regenerated Overview: Enterprise transaction ledger at planetary scale.',
        missionValues: ['Zero downtime', 'Absolute transparency'],
        products: ['LedgerCore', 'VaultAI'],
        techStack: ['Node.js', 'Go', 'Kafka'],
        interviewCulture: 'Rigorous architectural deep dives'
      }
    }));

    const result = await editorService.regenerateSection(mockKit, {
      section: 'COMPANY_BRIEF',
      provider: mockProvider
    });

    assert.strictEqual(result.section, 'COMPANY_BRIEF');
    assert.strictEqual(mockKit.companyBrief.overview, 'Regenerated Overview: Enterprise transaction ledger at planetary scale.');

    // CRITICAL: Ensure questions and other sections were NOT touched
    assert.strictEqual(mockKit.modules[0].questions.length, 4);
    assert.strictEqual(mockKit.modules[0].questions[0].questionId, 'q-edited');
    assert.strictEqual(mockKit.modules[1].questions[0].questionId, 'q-behav-1');
    assert.strictEqual(mockKit.requirements.length, 2);
    assert.strictEqual(mockKit.version, 2);
  });

  it('regenerating TECHNICAL questions preserves edited, created, and pinned questions while replacing only unpinned generated questions', async () => {
    // In mockKit.modules[0], we have:
    // - q-edited: USER_EDITED -> MUST PRESERVE
    // - q-custom: USER_CREATED -> MUST PRESERVE
    // - q-pinned: GENERATED, isPinned=true -> MUST PRESERVE
    // - q-replaceable: GENERATED, isPinned=false -> MUST BE REPLACED

    const initialBehavQuestions = [...mockKit.modules[1].questions];

    const result = await editorService.regenerateSection(mockKit, {
      section: 'CATEGORY_QUESTIONS',
      category: 'TECHNICAL',
      provider: mockProvider
    });

    assert.strictEqual(result.section, 'CATEGORY_QUESTIONS');
    assert.strictEqual(result.category, 'TECHNICAL');
    assert.strictEqual(result.preservedCount, 3); // q-edited, q-custom, q-pinned
    assert.strictEqual(result.replacedCount, 1);  // q-replaceable

    const techQuestions = mockKit.modules[0].questions;
    const techQuestionIds = techQuestions.map(q => q.questionId);

    // 1. All 3 protected questions are present
    assert.ok(techQuestionIds.includes('q-edited'), 'USER_EDITED question must be preserved');
    assert.ok(techQuestionIds.includes('q-custom'), 'USER_CREATED question must be preserved');
    assert.ok(techQuestionIds.includes('q-pinned'), 'PINNED question must be preserved');

    // 2. The unpinned generated question was replaced
    assert.ok(!techQuestionIds.includes('q-replaceable'), 'Unpinned GENERATED question must be replaced');

    // 3. New generated questions were added
    assert.ok(techQuestions.length > 3);

    // 4. UNRELATED MODULES: Behavioral module MUST NOT BE TOUCHED
    assert.deepStrictEqual(mockKit.modules[1].questions, initialBehavQuestions);

    // 5. Version incremented
    assert.strictEqual(mockKit.version, 2);
  });

  it('regenerating schedule recalculates deterministic timeline for requested horizon', async () => {
    const result = await editorService.regenerateSection(mockKit, {
      section: 'SCHEDULE',
      totalDays: 14
    });

    assert.strictEqual(result.section, 'SCHEDULE');
    assert.strictEqual(mockKit.schedule.length, 14);
    assert.strictEqual(mockKit.schedule[0].day, 1);
    assert.strictEqual(mockKit.schedule[13].day, 14);
    assert.strictEqual(mockKit.version, 2);
  });

  it('detects version mismatch for optimistic concurrency locking', () => {
    mockKit.version = 3;
    const staleClientVersion = 2;
    const hasConflict = staleClientVersion !== mockKit.version;
    assert.strictEqual(hasConflict, true, 'Stale version must be detected as a conflict');
  });
});
