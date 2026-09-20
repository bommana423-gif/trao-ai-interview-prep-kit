/**
 * Schema validation and data contract enforcement for the 8-stage LLM generation pipeline.
 * Ensures strict types, stable IDs, and verifies that questions reference valid extracted requirement IDs.
 */

export class SchemaValidationError extends Error {
  constructor(message, stage, errors = []) {
    super(`[${stage}] Schema Validation Error: ${message}`);
    this.name = 'SchemaValidationError';
    this.stage = stage;
    this.errors = errors;
  }
}

const VALID_REQUIREMENT_KINDS = ['technical', 'behavioral', 'domain', 'experience', 'education'];
const VALID_PRIORITIES = ['must-have', 'nice-to-have'];

/**
 * Validates Stage 1: Extracted Requirements
 */
export function validateRequirements(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    throw new SchemaValidationError('Root output must be an object', 'Stage1_Requirements');
  }

  if (!Array.isArray(data.requirements)) {
    errors.push('Missing or invalid "requirements" array');
  } else {
    data.requirements.forEach((req, idx) => {
      if (!req.id || typeof req.id !== 'string') {
        errors.push(`Requirement[${idx}] must have a non-empty string "id"`);
      }
      if (!req.text || typeof req.text !== 'string') {
        errors.push(`Requirement[${idx}] must have a non-empty string "text"`);
      }
      if (!req.kind || !VALID_REQUIREMENT_KINDS.includes(req.kind.toLowerCase())) {
        errors.push(`Requirement[${idx}] kind "${req.kind}" must be one of: ${VALID_REQUIREMENT_KINDS.join(', ')}`);
      }
      if (!req.priority || !VALID_PRIORITIES.includes(req.priority.toLowerCase())) {
        errors.push(`Requirement[${idx}] priority "${req.priority}" must be one of: ${VALID_PRIORITIES.join(', ')}`);
      }
    });
  }

  // Check sparsity & limitation preservation
  if (typeof data.isSparseJd !== 'boolean') {
    data.isSparseJd = Boolean(data.isSparseJd);
  }

  if (data.insufficientInfoNotes !== undefined && data.insufficientInfoNotes !== null && typeof data.insufficientInfoNotes !== 'string') {
    errors.push('"insufficientInfoNotes" must be a string or null');
  }

  if (errors.length > 0) {
    throw new SchemaValidationError(errors.join('; '), 'Stage1_Requirements', errors);
  }

  return {
    requirements: data.requirements.map(req => ({
      ...req,
      kind: req.kind.toLowerCase(),
      priority: req.priority.toLowerCase()
    })),
    isSparseJd: data.isSparseJd,
    insufficientInfoNotes: data.insufficientInfoNotes || null
  };
}

/**
 * Validates Stage 2: Company Brief
 */
export function validateCompanyBrief(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    throw new SchemaValidationError('Root output must be an object', 'Stage2_CompanyBrief');
  }

  const brief = data.companyBrief || data;

  if (!brief.overview || typeof brief.overview !== 'string') {
    errors.push('Missing or invalid "overview" string in company brief');
  }

  if (errors.length > 0) {
    throw new SchemaValidationError(errors.join('; '), 'Stage2_CompanyBrief', errors);
  }

  return {
    overview: brief.overview,
    missionValues: Array.isArray(brief.missionValues) ? brief.missionValues : (brief.missionValues ? [brief.missionValues] : []),
    techStack: Array.isArray(brief.techStack) ? brief.techStack : [],
    products: Array.isArray(brief.products) ? brief.products : [],
    interviewCulture: brief.interviewCulture || 'Standard industry technical and behavioral stages',
    sourceAttribution: Array.isArray(brief.sourceAttribution) ? brief.sourceAttribution : []
  };
}

/**
 * Validates Stage 3: Role Breakdown
 */
export function validateRoleBreakdown(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    throw new SchemaValidationError('Root output must be an object', 'Stage3_RoleBreakdown');
  }

  const breakdown = data.roleBreakdown || data;

  if (!breakdown.title || typeof breakdown.title !== 'string') {
    errors.push('Missing or invalid "title" in role breakdown');
  }
  if (!breakdown.seniority || typeof breakdown.seniority !== 'string') {
    errors.push('Missing or invalid "seniority" in role breakdown');
  }

  if (errors.length > 0) {
    throw new SchemaValidationError(errors.join('; '), 'Stage3_RoleBreakdown', errors);
  }

  return {
    title: breakdown.title,
    seniority: breakdown.seniority,
    coreFocus: breakdown.coreFocus || '',
    dayToDayResponsibilities: Array.isArray(breakdown.dayToDayResponsibilities) ? breakdown.dayToDayResponsibilities : [],
    primaryChallenges: Array.isArray(breakdown.primaryChallenges) ? breakdown.primaryChallenges : [],
    successCriteria: Array.isArray(breakdown.successCriteria) ? breakdown.successCriteria : []
  };
}

/**
 * Validates Question Stages (Stages 4, 5, 6, 7)
 * Ensures every question references valid requirement IDs
 */
export function validateQuestions(data, validRequirementIds = [], stageName = 'QuestionsStage') {
  const errors = [];

  if (!data || typeof data !== 'object') {
    throw new SchemaValidationError('Root output must be an object', stageName);
  }

  const questions = Array.isArray(data.questions) 
    ? data.questions 
    : (Array.isArray(data) ? data : []);

  if (!Array.isArray(questions)) {
    throw new SchemaValidationError('Missing "questions" array in stage output', stageName);
  }

  const idSet = new Set(validRequirementIds);

  const validatedQuestions = questions.map((q, idx) => {
    const qErrors = [];
    const questionText = q.question || q.prompt;

    if (!q.id || typeof q.id !== 'string') {
      qErrors.push(`Question[${idx}] missing string "id"`);
    }
    if (!questionText || typeof questionText !== 'string') {
      qErrors.push(`Question[${idx}] missing string "question" or "prompt"`);
    }

    // Check requirement linkage
    const reqIds = Array.isArray(q.targetRequirementIds) 
      ? q.targetRequirementIds 
      : (q.targetRequirementId ? [q.targetRequirementId] : []);

    if (reqIds.length === 0) {
      qErrors.push(`Question[${idx}] ("${questionText?.slice(0, 30)}...") must reference at least one requirement ID in targetRequirementIds`);
    } else if (idSet.size > 0) {
      // Validate that all referenced requirement IDs actually exist
      const invalidIds = reqIds.filter(id => !idSet.has(id));
      if (invalidIds.length > 0) {
        qErrors.push(`Question[${idx}] references non-existent requirement ID(s): [${invalidIds.join(', ')}]. Valid IDs: [${Array.from(idSet).join(', ')}]`);
      }
    }

    if (qErrors.length > 0) {
      errors.push(...qErrors);
    }

    return {
      id: q.id || `q-${idx + 1}`,
      question: questionText,
      targetRequirementIds: reqIds,
      category: q.category || 'TECHNICAL',
      difficulty: q.difficulty || 'MID',
      estimatedMinutes: Number(q.estimatedMinutes) || 15,
      answerFramework: q.answerFramework || {
        approach: q.sampleAnswerStar?.situation ? 'STAR Method' : '',
        keyPointsToCover: q.sampleAnswerStar ? [q.sampleAnswerStar.action, q.sampleAnswerStar.result].filter(Boolean) : []
      },
      rubric: q.rubric || {
        criteria: `Mastery of requirement(s): ${reqIds.join(', ')}`,
        level1Deficient: 'Fails to demonstrate foundational competence or practical experience',
        level3Acceptable: 'Demonstrates solid working knowledge with standard implementations',
        level5Exceptional: 'Demonstrates deep architectural mastery, edge case awareness, and production resilience'
      },
      followUpProbes: Array.isArray(q.followUpProbes) ? q.followUpProbes : []
    };
  });

  if (errors.length > 0) {
    throw new SchemaValidationError(errors.join('; '), stageName, errors);
  }

  return validatedQuestions;
}

/**
 * Validates Stage 8: Flashcards
 */
export function validateFlashcards(data, validRequirementIds = []) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    throw new SchemaValidationError('Root output must be an object', 'Stage8_Flashcards');
  }

  const flashcards = Array.isArray(data.flashcards) 
    ? data.flashcards 
    : (Array.isArray(data) ? data : []);

  const idSet = new Set(validRequirementIds);

  const validatedCards = flashcards.map((card, idx) => {
    if (!card.frontPrompt || typeof card.frontPrompt !== 'string') {
      errors.push(`Flashcard[${idx}] must have a non-empty string "frontPrompt"`);
    }

    if (card.targetRequirementId && idSet.size > 0 && !idSet.has(card.targetRequirementId)) {
      errors.push(`Flashcard[${idx}] references non-existent requirement ID: "${card.targetRequirementId}"`);
    }

    return {
      id: card.id || `fc-${idx + 1}`,
      targetRequirementId: card.targetRequirementId || (validRequirementIds[0] || 'req-1'),
      category: card.category || 'CORE_CONCEPT',
      frontPrompt: card.frontPrompt,
      backKeyPoints: Array.isArray(card.backKeyPoints) ? card.backKeyPoints : [card.backKeyPoints || ''],
      quickTip: card.quickTip || ''
    };
  });

  if (errors.length > 0) {
    throw new SchemaValidationError(errors.join('; '), 'Stage8_Flashcards', errors);
  }

  return validatedCards;
}

export default {
  validateRequirements,
  validateCompanyBrief,
  validateRoleBreakdown,
  validateQuestions,
  validateFlashcards,
  SchemaValidationError
};
