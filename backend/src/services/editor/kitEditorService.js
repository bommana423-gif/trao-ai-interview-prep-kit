import { checkCoverage } from '../coverage/coverageChecker.js';
import { allocateSchedule } from '../scheduler/scheduleAllocator.js';
import { executeStage2GenerateCompanyBrief } from '../llm/stages/stage2GenerateCompanyBrief.js';
import { executeStage4GenerateTechnicalQuestions } from '../llm/stages/stage4GenerateTechnicalQuestions.js';
import { executeStage5GenerateBehavioralQuestions } from '../llm/stages/stage5GenerateBehavioralQuestions.js';
import { executeStage6GenerateSystemDesignQuestions } from '../llm/stages/stage6GenerateSystemDesignQuestions.js';
import { executeStage7GenerateCompanyFitQuestions } from '../llm/stages/stage7GenerateCompanyFitQuestions.js';

/**
 * Recalculates coverage score and uncovered gaps across all modules in the kit.
 */
export function recalculateKitCoverage(kit) {
  const allQuestions = [];
  (kit.modules || []).forEach(m => {
    (m.questions || []).forEach(q => allQuestions.push(q));
  });

  const coverageResult = checkCoverage(kit.requirements || [], allQuestions);
  kit.coverageScore = coverageResult.coverageScore;
  kit.uncoveredGaps = coverageResult.uncovered_requirement_ids.map(id => {
    const req = (kit.requirements || []).find(r => r.id === id);
    return `[${id}] ${req?.text || 'Uncovered'}`;
  });

  return coverageResult;
}

/**
 * Increment kit version counter for optimistic concurrency control.
 */
export function bumpVersion(kit) {
  kit.version = (Number(kit.version) || 1) + 1;
}

// ==========================================
// 1. COMPANY BRIEF & ROLE EDITING
// ==========================================

export function updateCompanyBrief(kit, updates = {}) {
  kit.companyBrief = {
    ...kit.companyBrief?.toObject?.() || kit.companyBrief,
    ...updates
  };
  bumpVersion(kit);
  return kit.companyBrief;
}

export function updateRoleBreakdown(kit, updates = {}) {
  kit.roleBreakdown = {
    ...kit.roleBreakdown?.toObject?.() || kit.roleBreakdown,
    ...updates
  };
  bumpVersion(kit);
  return kit.roleBreakdown;
}

// ==========================================
// 2. REQUIREMENTS EDITING
// ==========================================

export function updateRequirement(kit, reqId, updates = {}) {
  const req = (kit.requirements || []).find(r => r.id === reqId);
  if (!req) {
    throw new Error(`Requirement with ID "${reqId}" not found in kit.`);
  }

  if (updates.text !== undefined) {
    req.text = updates.text.trim();
  }
  if (updates.kind !== undefined) {
    req.kind = updates.kind.toLowerCase();
  }
  if (updates.priority !== undefined) {
    req.priority = updates.priority.toLowerCase();
  }
  if (updates.isPinned !== undefined) {
    req.isPinned = Boolean(updates.isPinned);
  }

  if (req.origin === 'GENERATED') {
    req.origin = 'USER_EDITED';
  }

  recalculateKitCoverage(kit);
  bumpVersion(kit);
  return req;
}

export function addRequirement(kit, reqData = {}) {
  const nextNum = (kit.requirements || []).length + 1;
  const newReq = {
    id: reqData.id || `req-user-${Date.now()}-${nextNum}`,
    text: reqData.text || 'New User Requirement',
    kind: (reqData.kind || 'technical').toLowerCase(),
    priority: (reqData.priority || 'must-have').toLowerCase(),
    sourceSnippet: reqData.sourceSnippet || 'User added requirement',
    origin: 'USER_CREATED',
    isPinned: reqData.isPinned !== undefined ? Boolean(reqData.isPinned) : true
  };

  kit.requirements.push(newReq);
  recalculateKitCoverage(kit);
  bumpVersion(kit);
  return newReq;
}

export function deleteRequirement(kit, reqId) {
  const initialLen = kit.requirements.length;
  kit.requirements = kit.requirements.filter(r => r.id !== reqId);

  if (kit.requirements.length === initialLen) {
    throw new Error(`Requirement with ID "${reqId}" not found.`);
  }

  // Remove reqId from any question targeting it
  (kit.modules || []).forEach(m => {
    (m.questions || []).forEach(q => {
      if (Array.isArray(q.competencyIds)) {
        q.competencyIds = q.competencyIds.filter(id => id !== reqId);
      }
    });
  });

  recalculateKitCoverage(kit);
  bumpVersion(kit);
  return true;
}

// ==========================================
// 3. QUESTIONS EDITING & REORGANIZATION
// ==========================================

export function findQuestionInKit(kit, questionId) {
  for (const mod of kit.modules || []) {
    const qIndex = (mod.questions || []).findIndex(q => (q.questionId || q.id) === questionId);
    if (qIndex !== -1) {
      return { module: mod, question: mod.questions[qIndex], index: qIndex };
    }
  }
  return null;
}

export function updateQuestion(kit, questionId, updates = {}) {
  const found = findQuestionInKit(kit, questionId);
  if (!found) {
    throw new Error(`Question with ID "${questionId}" not found in any module.`);
  }

  const { question } = found;

  if (updates.prompt !== undefined) {
    question.prompt = updates.prompt.trim();
  }
  if (updates.difficulty !== undefined) {
    question.difficulty = updates.difficulty.toUpperCase();
  }
  if (updates.estimatedMinutes !== undefined) {
    question.estimatedMinutes = Number(updates.estimatedMinutes);
  }
  if (updates.competencyIds !== undefined) {
    question.competencyIds = updates.competencyIds;
  }
  if (updates.userNotes !== undefined) {
    question.userNotes = updates.userNotes;
  }

  // Answer Framework (outlines, key points, common traps)
  if (updates.answerFramework) {
    question.answerFramework = {
      ...question.answerFramework?.toObject?.() || question.answerFramework || {},
      ...updates.answerFramework
    };
  }

  // Rubric
  if (updates.rubric) {
    question.rubric = {
      ...question.rubric?.toObject?.() || question.rubric || {},
      ...updates.rubric
    };
  }

  if (updates.followUpProbes !== undefined) {
    question.followUpProbes = updates.followUpProbes;
  }

  // Pinning
  if (updates.isPinned !== undefined) {
    question.isPinned = Boolean(updates.isPinned);
  }

  // State model: transition GENERATED -> USER_EDITED
  if (question.origin === 'GENERATED') {
    question.origin = 'USER_EDITED';
  }
  question.isCustomized = true;
  question.revision = (Number(question.revision) || 1) + 1;

  // If category changed, move question
  if (updates.category && updates.category !== question.category) {
    moveQuestionCategory(kit, questionId, updates.category);
  }

  recalculateKitCoverage(kit);
  bumpVersion(kit);
  return question;
}

export function addQuestion(kit, questionData = {}) {
  const targetCategory = (questionData.category || 'TECHNICAL').toUpperCase();
  let targetModule = (kit.modules || []).find(m => 
    m.type === targetCategory || m.moduleId.includes(targetCategory.toLowerCase())
  );

  if (!targetModule) {
    targetModule = {
      moduleId: `mod-${targetCategory.toLowerCase()}`,
      title: `${targetCategory} Module`,
      type: targetCategory,
      priority: 'HIGH',
      questions: []
    };
    kit.modules.push(targetModule);
  }

  const newQuestion = {
    questionId: questionData.questionId || questionData.id || `q-user-${Date.now()}`,
    prompt: questionData.prompt || questionData.question || 'Custom Interview Question',
    category: targetCategory,
    difficulty: (questionData.difficulty || 'MID').toUpperCase(),
    competencyIds: questionData.competencyIds || questionData.targetRequirementIds || [],
    estimatedMinutes: Number(questionData.estimatedMinutes) || 20,
    answerFramework: questionData.answerFramework || {
      approach: 'Custom framework',
      keyPointsToCover: [],
      commonTraps: []
    },
    rubric: questionData.rubric || {
      criteria: 'Evaluation criteria',
      level1Deficient: 'Deficient response',
      level3Acceptable: 'Acceptable response',
      level5Exceptional: 'Exceptional response'
    },
    followUpProbes: questionData.followUpProbes || [],
    origin: 'USER_CREATED',
    isPinned: questionData.isPinned !== undefined ? Boolean(questionData.isPinned) : true,
    order: (targetModule.questions || []).length,
    isCustomized: true,
    revision: 1
  };

  targetModule.questions.push(newQuestion);
  recalculateKitCoverage(kit);
  bumpVersion(kit);
  return newQuestion;
}

export function deleteQuestion(kit, questionId) {
  const found = findQuestionInKit(kit, questionId);
  if (!found) {
    throw new Error(`Question with ID "${questionId}" not found in kit.`);
  }

  found.module.questions.splice(found.index, 1);

  // Remove from schedule if present
  (kit.schedule || []).forEach(day => {
    if (Array.isArray(day.question_ids)) {
      day.question_ids = day.question_ids.filter(id => id !== questionId);
    }
  });

  recalculateKitCoverage(kit);
  bumpVersion(kit);
  return true;
}

export function moveQuestionCategory(kit, questionId, targetCategory) {
  const found = findQuestionInKit(kit, questionId);
  if (!found) {
    throw new Error(`Question with ID "${questionId}" not found.`);
  }

  const normalizedCategory = targetCategory.toUpperCase();
  let targetModule = (kit.modules || []).find(m => 
    m.type === normalizedCategory || m.moduleId.includes(normalizedCategory.toLowerCase())
  );

  if (!targetModule) {
    targetModule = {
      moduleId: `mod-${normalizedCategory.toLowerCase()}`,
      title: `${normalizedCategory} Module`,
      type: normalizedCategory,
      priority: 'MEDIUM',
      questions: []
    };
    kit.modules.push(targetModule);
  }

  // Remove from source module
  const [movingQuestion] = found.module.questions.splice(found.index, 1);
  movingQuestion.category = normalizedCategory;
  if (movingQuestion.origin === 'GENERATED') {
    movingQuestion.origin = 'USER_EDITED';
  }

  targetModule.questions.push(movingQuestion);
  bumpVersion(kit);
  return movingQuestion;
}

export function reorderQuestions(kit, moduleId, orderedQuestionIds = []) {
  const targetModule = (kit.modules || []).find(m => m.moduleId === moduleId || m.type === moduleId);
  if (!targetModule) {
    throw new Error(`Module "${moduleId}" not found.`);
  }

  const questionMap = new Map((targetModule.questions || []).map(q => [q.questionId || q.id, q]));
  const reordered = [];

  orderedQuestionIds.forEach((id, idx) => {
    if (questionMap.has(id)) {
      const q = questionMap.get(id);
      q.order = idx;
      reordered.push(q);
      questionMap.delete(id);
    }
  });

  // Append any questions not explicitly mentioned
  for (const remaining of questionMap.values()) {
    remaining.order = reordered.length;
    reordered.push(remaining);
  }

  targetModule.questions = reordered;
  bumpVersion(kit);
  return targetModule.questions;
}

// ==========================================
// 4. FLASHCARDS EDITING
// ==========================================

export function addFlashcard(kit, cardData = {}) {
  const newCard = {
    id: cardData.id || `fc-user-${Date.now()}`,
    targetRequirementId: cardData.targetRequirementId || (kit.requirements?.[0]?.id || 'req-1'),
    category: (cardData.category || 'CORE_CONCEPT').toUpperCase(),
    frontPrompt: cardData.frontPrompt || 'Flashcard Question',
    backKeyPoints: Array.isArray(cardData.backKeyPoints) ? cardData.backKeyPoints : [cardData.backKeyPoints || ''],
    quickTip: cardData.quickTip || '',
    origin: 'USER_CREATED',
    isPinned: cardData.isPinned !== undefined ? Boolean(cardData.isPinned) : true
  };

  if (!Array.isArray(kit.flashcards)) {
    kit.flashcards = [];
  }

  kit.flashcards.push(newCard);
  bumpVersion(kit);
  return newCard;
}

export function updateFlashcard(kit, cardId, updates = {}) {
  const card = (kit.flashcards || []).find(fc => fc.id === cardId);
  if (!card) {
    throw new Error(`Flashcard with ID "${cardId}" not found.`);
  }

  if (updates.frontPrompt !== undefined) {
    card.frontPrompt = updates.frontPrompt.trim();
  }
  if (updates.backKeyPoints !== undefined) {
    card.backKeyPoints = Array.isArray(updates.backKeyPoints) ? updates.backKeyPoints : [updates.backKeyPoints];
  }
  if (updates.quickTip !== undefined) {
    card.quickTip = updates.quickTip.trim();
  }
  if (updates.category !== undefined) {
    card.category = updates.category.toUpperCase();
  }
  if (updates.targetRequirementId !== undefined) {
    card.targetRequirementId = updates.targetRequirementId;
  }
  if (updates.isPinned !== undefined) {
    card.isPinned = Boolean(updates.isPinned);
  }

  if (card.origin === 'GENERATED') {
    card.origin = 'USER_EDITED';
  }

  bumpVersion(kit);
  return card;
}

export function deleteFlashcard(kit, cardId) {
  const initialLen = (kit.flashcards || []).length;
  kit.flashcards = (kit.flashcards || []).filter(fc => fc.id !== cardId);

  if (kit.flashcards.length === initialLen) {
    throw new Error(`Flashcard with ID "${cardId}" not found.`);
  }

  bumpVersion(kit);
  return true;
}

// ==========================================
// 5. TARGETED SELECTIVE REGENERATION
// ==========================================

/**
 * Regenerates an isolated section while strictly preserving:
 * - User edits elsewhere in the kit
 * - Manually created questions (origin: USER_CREATED)
 * - Edited questions (origin: USER_EDITED)
 * - Pinned questions (isPinned: true)
 * - Only unpinned, unedited generated questions in that category are refreshed.
 */
export async function regenerateSection(kit, options = {}) {
  const {
    section,           // 'COMPANY_BRIEF' | 'CATEGORY_QUESTIONS' | 'SCHEDULE'
    category = null,   // 'TECHNICAL' | 'SYSTEM_DESIGN' | 'BEHAVIORAL' | 'COMPANY_SPECIFIC'
    provider,
    scrapedPages = [],
    totalDays = null
  } = options;

  if (section === 'COMPANY_BRIEF') {
    // 1. REGENERATE COMPANY BRIEF (Leaves everything else strictly untouched)
    const newBrief = await executeStage2GenerateCompanyBrief(provider, {
      targetCompany: kit.targetCompany,
      companyUrl: kit.companyUrl,
      scrapedPages: scrapedPages.length > 0 ? scrapedPages : []
    });

    kit.companyBrief = newBrief;
    bumpVersion(kit);
    return { section: 'COMPANY_BRIEF', data: kit.companyBrief };
  }

  if (section === 'CATEGORY_QUESTIONS') {
    // 2. REGENERATE ONE QUESTION CATEGORY
    if (!category) {
      throw new Error('Must specify "category" when regenerating questions.');
    }

    const normalizedCat = category.toUpperCase();
    const targetModule = (kit.modules || []).find(m => 
      m.type === normalizedCat || m.moduleId.includes(normalizedCat.toLowerCase())
    );

    if (!targetModule) {
      throw new Error(`Module for category "${category}" not found.`);
    }

    // CRITICAL PRESERVATION PARTITIONING:
    // Pinned questions, user-created questions, and user-edited questions MUST NOT be replaced
    const preservedQuestions = [];
    const replacedQuestions = [];

    (targetModule.questions || []).forEach(q => {
      const isProtected = q.isPinned || q.origin === 'USER_CREATED' || q.origin === 'USER_EDITED';
      if (isProtected) {
        preservedQuestions.push(q);
      } else {
        replacedQuestions.push(q);
      }
    });

    // Invoke the corresponding generator stage
    let newlyGenerated = [];
    if (normalizedCat === 'TECHNICAL') {
      newlyGenerated = await executeStage4GenerateTechnicalQuestions(provider, {
        requirements: kit.requirements,
        roleBreakdown: kit.roleBreakdown,
        companyBrief: kit.companyBrief
      });
    } else if (normalizedCat === 'BEHAVIORAL') {
      newlyGenerated = await executeStage5GenerateBehavioralQuestions(provider, {
        requirements: kit.requirements,
        roleBreakdown: kit.roleBreakdown,
        companyBrief: kit.companyBrief
      });
    } else if (normalizedCat === 'SYSTEM_DESIGN') {
      const sysResult = await executeStage6GenerateSystemDesignQuestions(provider, {
        requirements: kit.requirements,
        roleBreakdown: kit.roleBreakdown,
        companyBrief: kit.companyBrief
      });
      newlyGenerated = sysResult.questions || [];
    } else if (normalizedCat === 'COMPANY_SPECIFIC') {
      newlyGenerated = await executeStage7GenerateCompanyFitQuestions(provider, {
        requirements: kit.requirements,
        roleBreakdown: kit.roleBreakdown,
        companyBrief: kit.companyBrief
      });
    }

    // Format new questions for module storage
    const formattedNewQuestions = newlyGenerated.map((q, idx) => ({
      questionId: q.id || `q-${normalizedCat.toLowerCase()}-${Date.now()}-${idx + 1}`,
      prompt: q.question,
      category: normalizedCat,
      difficulty: q.difficulty,
      competencyIds: q.targetRequirementIds,
      estimatedMinutes: q.estimatedMinutes,
      answerFramework: q.answerFramework,
      rubric: q.rubric,
      followUpProbes: q.followUpProbes,
      origin: 'GENERATED',
      isPinned: false,
      order: preservedQuestions.length + idx
    }));

    // Merge: Protected questions are kept + newly generated questions appended
    targetModule.questions = [...preservedQuestions, ...formattedNewQuestions];

    // Deterministically update coverage
    recalculateKitCoverage(kit);
    bumpVersion(kit);

    return {
      section: 'CATEGORY_QUESTIONS',
      category: normalizedCat,
      preservedCount: preservedQuestions.length,
      replacedCount: replacedQuestions.length,
      newlyGeneratedCount: formattedNewQuestions.length,
      moduleQuestions: targetModule.questions
    };
  }

  if (section === 'SCHEDULE') {
    // 3. REGENERATE SCHEDULE (Deterministic calculation based on current questions)
    const targetHorizon = totalDays ? Number(totalDays) : (kit.schedule?.length || 7);
    const allQuestions = [];
    (kit.modules || []).forEach(m => {
      (m.questions || []).forEach(q => allQuestions.push({
        id: q.questionId,
        question: q.prompt,
        category: q.category,
        difficulty: q.difficulty,
        targetRequirementIds: q.competencyIds,
        estimatedMinutes: q.estimatedMinutes
      }));
    });

    kit.schedule = allocateSchedule({
      questions: allQuestions,
      requirements: kit.requirements || [],
      totalDays: targetHorizon
    });

    bumpVersion(kit);
    return { section: 'SCHEDULE', totalDays: targetHorizon, schedule: kit.schedule };
  }

  throw new Error(`Invalid section "${section}" requested for regeneration.`);
}

export default {
  recalculateKitCoverage,
  bumpVersion,
  updateCompanyBrief,
  updateRoleBreakdown,
  updateRequirement,
  addRequirement,
  deleteRequirement,
  updateQuestion,
  addQuestion,
  deleteQuestion,
  moveQuestionCategory,
  reorderQuestions,
  addFlashcard,
  updateFlashcard,
  deleteFlashcard,
  regenerateSection
};
