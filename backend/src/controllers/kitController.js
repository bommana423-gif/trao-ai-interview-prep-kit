import PrepKit from '../models/PrepKit.js';
import { AppError } from '../middleware/errorHandler.js';
import * as editorService from '../services/editor/kitEditorService.js';
import * as practiceService from '../services/practice/flashcardPracticeService.js';

/**
 * Create a new Prep Kit for the authenticated user
 * POST /api/v1/kits
 */
export const createKit = async (req, res, next) => {
  try {
    const { targetRole, targetCompany, companyUrl, jobDescription, candidateResume } = req.body;

    if (!targetRole || !targetCompany || !jobDescription) {
      return next(new AppError('Please provide targetRole, targetCompany, and jobDescription.', 400));
    }

    const newKit = await PrepKit.create({
      userId: req.user.id, // Strictly tied to authenticated user ID
      targetRole: targetRole.trim(),
      targetCompany: targetCompany.trim(),
      companyUrl: companyUrl?.trim() || '',
      jobDescriptionRaw: jobDescription.trim(),
      candidateResumeRaw: candidateResume?.trim() || '',
      status: 'PENDING',
      coverageScore: 0,
      modules: []
    });

    res.status(201).json({
      success: true,
      message: 'Prep Kit created successfully',
      data: {
        kit: newKit
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all Prep Kits belonging exclusively to the authenticated user
 * GET /api/v1/kits
 */
export const getMyKits = async (req, res, next) => {
  try {
    // Strict multi-tenant isolation filter: always enforce userId
    const kits = await PrepKit.find({ userId: req.user.id })
      .select('targetRole targetCompany status coverageScore createdAt updatedAt')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: kits.length,
      data: {
        kits
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific Prep Kit by ID with strict ownership validation
 * GET /api/v1/kits/:id
 */
export const getKitById = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);

    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }

    // STRICT USER ISOLATION CHECK:
    // A user can ONLY access kits they own. Accessing another user's kit returns 403 Forbidden.
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied. You do not have permission to view this Prep Kit.', 403));
    }

    res.status(200).json({
      success: true,
      data: {
        kit
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a specific Prep Kit by ID with strict ownership validation
 * DELETE /api/v1/kits/:id
 */
export const deleteKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);

    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }

    // Strict ownership validation before deletion
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied. You do not have permission to delete this Prep Kit.', 403));
    }

    await PrepKit.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Prep Kit deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate a complete Prep Kit using the 8-Stage LLM Generation Pipeline
 * POST /api/v1/kits/generate
 */
export const generateKit = async (req, res, next) => {
  try {
    const {
      targetRole,
      targetCompany,
      companyUrl,
      jobDescription,
      candidateResume,
      allowLocalhost = false,
      providerName = null
    } = req.body;

    if (!targetRole || !targetCompany || !jobDescription) {
      return next(new AppError('Please provide targetRole, targetCompany, and jobDescription.', 400));
    }

    // Execute unified end-to-end kit generation pipeline
    const { generateCompleteKit } = await import('../services/llm/llmPipelineService.js');
    const kitData = await generateCompleteKit({
      targetRole: targetRole.trim(),
      targetCompany: targetCompany.trim(),
      companyUrl: companyUrl?.trim() || '',
      jd: jobDescription.trim(),
      candidateResume: candidateResume?.trim() || '',
      allowLocalhost,
      providerName,
      days: req.body.days || req.body.totalDays || 7
    });

    // 3. Persist kit into MongoDB
    const newKit = await PrepKit.create({
      userId: req.user.id,
      targetRole: kitData.targetRole,
      targetCompany: kitData.targetCompany,
      companyUrl: kitData.companyUrl,
      jobDescriptionRaw: kitData.jobDescriptionRaw,
      candidateResumeRaw: kitData.candidateResumeRaw,
      requirements: kitData.requirements,
      isSparseJd: kitData.isSparseJd,
      insufficientInfoNotes: kitData.insufficientInfoNotes,
      roleBreakdown: kitData.roleBreakdown,
      companyBrief: kitData.companyBrief,
      modules: kitData.modules,
      flashcards: kitData.flashcards,
      schedule: kitData.schedule,
      coverageScore: kitData.coverageScore,
      uncoveredGaps: kitData.uncoveredGaps,
      status: 'READY'
    });

    res.status(201).json({
      success: true,
      message: 'Prep Kit generated successfully across all 8 stages',
      data: {
        kit: newKit
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deterministically allocate or update a study schedule for an existing kit
 * POST /api/v1/kits/:id/schedule
 */
export const generateScheduleForKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const totalDays = parseInt(req.body.totalDays, 10) || 7;
    const { allocateSchedule } = await import('../services/scheduler/scheduleAllocator.js');

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

    const schedule = allocateSchedule({
      questions: allQuestions,
      requirements: kit.requirements || [],
      totalDays
    });

    kit.schedule = schedule;
    await kit.save();

    res.status(200).json({
      success: true,
      message: `Deterministic schedule allocated for ${totalDays} days`,
      data: { schedule }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Deterministic coverage checking and targeted gap remediation
 * POST /api/v1/kits/:id/remediate
 */
export const remediateKitCoverage = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const { remediateCoverageGaps } = await import('../services/coverage/remediationService.js');
    const { getLlmProvider } = await import('../services/llm/providers/providerFactory.js');

    const allQuestions = [];
    (kit.modules || []).forEach(m => {
      (m.questions || []).forEach(q => allQuestions.push({
        id: q.questionId,
        question: q.prompt,
        category: q.category,
        difficulty: q.difficulty,
        targetRequirementIds: q.competencyIds,
        estimatedMinutes: q.estimatedMinutes,
        answerFramework: q.answerFramework,
        rubric: q.rubric
      }));
    });

    const provider = getLlmProvider(req.body.providerName);
    const result = await remediateCoverageGaps({
      requirements: kit.requirements || [],
      existingQuestions: allQuestions,
      roleBreakdown: kit.roleBreakdown || {},
      companyBrief: kit.companyBrief || {},
      provider,
      maxPasses: parseInt(req.body.maxPasses, 10) || 1
    });

    if (result.remediatedQuestions.length > 0) {
      let techModule = kit.modules.find(m => m.type === 'TECHNICAL');
      if (!techModule) {
        techModule = {
          moduleId: 'mod-tech',
          title: 'Technical Deep Dive',
          type: 'TECHNICAL',
          priority: 'CRITICAL',
          questions: []
        };
        kit.modules.push(techModule);
      }
      result.remediatedQuestions.forEach(q => {
        techModule.questions.push({
          questionId: q.id,
          prompt: q.question,
          category: q.category || 'TECHNICAL_DEEP_DIVE',
          difficulty: q.difficulty || 'MID',
          competencyIds: q.targetRequirementIds,
          estimatedMinutes: q.estimatedMinutes || 20,
          answerFramework: q.answerFramework,
          rubric: q.rubric,
          followUpProbes: q.followUpProbes || []
        });
      });
    }

    kit.coverageScore = result.coverageScore;
    kit.uncoveredGaps = result.remainingGaps.map(g => `[${g.id}] ${g.text}`);
    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Coverage remediation executed',
      data: {
        status: result.status,
        coverageScore: kit.coverageScore,
        uncovered_requirement_ids: result.uncovered_requirement_ids,
        remainingGaps: result.remainingGaps,
        newQuestionsAdded: result.remediatedQuestions.length
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update general kit content with optimistic locking
 * PATCH /api/v1/kits/:id
 */
export const updateKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    // Optimistic concurrency locking verification
    if (req.body.version !== undefined && Number(req.body.version) !== kit.version) {
      return next(new AppError(
        `Conflict: Prep Kit was modified by another session (expected version ${kit.version}, provided ${req.body.version}). Please refresh and reapply your changes.`,
        409
      ));
    }

    const { companyBrief, roleBreakdown, requirements } = req.body;

    if (companyBrief) {
      editorService.updateCompanyBrief(kit, companyBrief);
    }
    if (roleBreakdown) {
      editorService.updateRoleBreakdown(kit, roleBreakdown);
    }
    if (Array.isArray(requirements)) {
      kit.requirements = requirements;
      editorService.recalculateKitCoverage(kit);
      editorService.bumpVersion(kit);
    }

    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Prep Kit updated successfully',
      data: { kit }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Add a custom question to a kit module
 * POST /api/v1/kits/:id/questions
 */
export const addQuestionToKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const question = editorService.addQuestion(kit, req.body);
    await kit.save();

    res.status(201).json({
      success: true,
      message: 'Question added to kit',
      data: {
        question,
        version: kit.version,
        coverageScore: kit.coverageScore
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update an existing question (prompt, rubric, answerFramework, pin, category)
 * PATCH /api/v1/kits/:id/questions/:questionId
 */
export const updateQuestionInKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const updatedQuestion = editorService.updateQuestion(kit, req.params.questionId, req.body);
    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Question updated successfully',
      data: {
        question: updatedQuestion,
        version: kit.version,
        coverageScore: kit.coverageScore
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a question from a kit
 * DELETE /api/v1/kits/:id/questions/:questionId
 */
export const deleteQuestionFromKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    editorService.deleteQuestion(kit, req.params.questionId);
    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Question deleted successfully',
      data: {
        version: kit.version,
        coverageScore: kit.coverageScore
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Reorder questions within a module
 * POST /api/v1/kits/:id/questions/reorder
 */
export const reorderQuestionsInModule = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const { moduleId, orderedQuestionIds } = req.body;
    if (!moduleId || !Array.isArray(orderedQuestionIds)) {
      return next(new AppError('Please provide moduleId and an ordered array of question IDs.', 400));
    }

    const questions = editorService.reorderQuestions(kit, moduleId, orderedQuestionIds);
    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Questions reordered successfully',
      data: { questions, version: kit.version }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Add a flashcard to kit
 * POST /api/v1/kits/:id/flashcards
 */
export const addFlashcardToKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const flashcard = editorService.addFlashcard(kit, req.body);
    await kit.save();

    res.status(201).json({
      success: true,
      message: 'Flashcard added successfully',
      data: { flashcard, version: kit.version }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update flashcard in kit
 * PATCH /api/v1/kits/:id/flashcards/:cardId
 */
export const updateFlashcardInKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const flashcard = editorService.updateFlashcard(kit, req.params.cardId, req.body);
    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Flashcard updated successfully',
      data: { flashcard, version: kit.version }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete flashcard from kit
 * DELETE /api/v1/kits/:id/flashcards/:cardId
 */
export const deleteFlashcardFromKit = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    editorService.deleteFlashcard(kit, req.params.cardId);
    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Flashcard deleted successfully',
      data: { version: kit.version }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Selective section regeneration with user edit and pin preservation
 * POST /api/v1/kits/:id/regenerate
 */
export const regenerateKitSection = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const { section, category, totalDays, providerName } = req.body;
    if (!section) {
      return next(new AppError('Must provide "section" to regenerate ("COMPANY_BRIEF", "CATEGORY_QUESTIONS", "SCHEDULE").', 400));
    }

    const { getLlmProvider } = await import('../services/llm/providers/providerFactory.js');
    const provider = getLlmProvider(providerName);

    const result = await editorService.regenerateSection(kit, {
      section,
      category,
      provider,
      totalDays
    });

    await kit.save();

    res.status(200).json({
      success: true,
      message: `Section ${section} regenerated successfully while preserving customizations`,
      data: {
        ...result,
        version: kit.version,
        coverageScore: kit.coverageScore,
        uncoveredGaps: kit.uncoveredGaps
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get ordered flashcard practice queue and deck summary
 * GET /api/v1/kits/:id/flashcards/practice
 */
export const getFlashcardPracticeSession = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const { filter, category } = req.query;
    const orderedCards = practiceService.orderFlashcardsForPractice(kit.flashcards, { filter, category });
    const summary = practiceService.getDeckPracticeSummary(kit.flashcards);

    res.status(200).json({
      success: true,
      data: {
        cards: orderedCards,
        summary,
        version: kit.version
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Submit confidence rating for a flashcard review
 * POST /api/v1/kits/:id/flashcards/:cardId/review
 */
export const submitFlashcardReview = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const { cardId } = req.params;
    const { confidence, responseTimeMs } = req.body;

    if (!confidence) {
      return next(new AppError('Confidence rating (1-4) is required.', 400));
    }

    const result = practiceService.recordCardReview(kit, cardId, { confidence, responseTimeMs });
    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Flashcard review recorded',
      data: {
        card: result.card,
        summary: result.summary,
        version: kit.version
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Reset flashcard practice metrics across the entire kit
 * POST /api/v1/kits/:id/flashcards/reset-practice
 */
export const resetFlashcardPractice = async (req, res, next) => {
  try {
    const kit = await PrepKit.findById(req.params.id);
    if (!kit) {
      return next(new AppError('Prep Kit not found.', 404));
    }
    if (kit.userId.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }

    const summary = practiceService.resetPracticeDeck(kit);
    await kit.save();

    res.status(200).json({
      success: true,
      message: 'Flashcard practice progress reset',
      data: {
        summary,
        version: kit.version
      }
    });
  } catch (err) {
    next(err);
  }
};

export default {
  createKit,
  getMyKits,
  getKitById,
  deleteKit,
  generateKit,
  generateScheduleForKit,
  remediateKitCoverage,
  updateKit,
  addQuestionToKit,
  updateQuestionInKit,
  deleteQuestionFromKit,
  reorderQuestionsInModule,
  addFlashcardToKit,
  updateFlashcardInKit,
  deleteFlashcardFromKit,
  regenerateKitSection,
  getFlashcardPracticeSession,
  submitFlashcardReview,
  resetFlashcardPractice
};
