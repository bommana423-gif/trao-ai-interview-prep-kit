import { getLlmProvider } from './providers/providerFactory.js';
import { executeStage1ExtractRequirements } from './stages/stage1ExtractRequirements.js';
import { executeStage2GenerateCompanyBrief } from './stages/stage2GenerateCompanyBrief.js';
import { executeStage3GenerateRoleBreakdown } from './stages/stage3GenerateRoleBreakdown.js';
import { executeStage4GenerateTechnicalQuestions } from './stages/stage4GenerateTechnicalQuestions.js';
import { executeStage5GenerateBehavioralQuestions } from './stages/stage5GenerateBehavioralQuestions.js';
import { executeStage6GenerateSystemDesignQuestions } from './stages/stage6GenerateSystemDesignQuestions.js';
import { executeStage7GenerateCompanyFitQuestions } from './stages/stage7GenerateCompanyFitQuestions.js';
import { executeStage8GenerateFlashcards } from './stages/stage8GenerateFlashcards.js';
import { remediateCoverageGaps } from '../coverage/remediationService.js';
import { allocateSchedule } from '../scheduler/scheduleAllocator.js';
import { crawlCompany } from '../research/crawlerService.js';

/**
 * 8-Stage Decoupled LLM Generation Pipeline for the Trao Prep Kit.
 * Executes stages sequentially, enforces data contracts, validates requirement ID linkages,
 * and compiles the full kit payload.
 */
export async function generatePrepKitPipeline(options) {
  const {
    targetRole,
    targetCompany,
    companyUrl = '',
    jobDescriptionRaw,
    candidateResumeRaw = '',
    scrapedPages = [],
    providerName = null,
    totalDays = 7,
    onProgress = null
  } = options;

  if (!jobDescriptionRaw || typeof jobDescriptionRaw !== 'string' || jobDescriptionRaw.trim().length === 0) {
    throw new Error('jobDescriptionRaw is required to generate a prep kit.');
  }

  const provider = getLlmProvider(providerName);

  const reportProgress = (stageNum, stageName) => {
    if (typeof onProgress === 'function') {
      onProgress({ stage: stageNum, stageName, totalStages: 8 });
    }
  };

  // STAGE 1: Extract atomic requirements from JD
  reportProgress(1, 'Extracting requirements from Job Description');
  const stage1Result = await executeStage1ExtractRequirements(provider, {
    jobDescriptionRaw,
    targetRole,
    targetCompany
  });
  const { requirements, isSparseJd, insufficientInfoNotes } = stage1Result;

  // STAGE 2: Generate Company Brief from retrieved crawler sources
  reportProgress(2, 'Synthesizing Company Brief from web sources');
  const companyBrief = await executeStage2GenerateCompanyBrief(provider, {
    targetCompany,
    companyUrl,
    scrapedPages
  });

  // STAGE 3: Generate Role Breakdown
  reportProgress(3, 'Analyzing role seniority, focus, and core challenges');
  const roleBreakdown = await executeStage3GenerateRoleBreakdown(provider, {
    targetRole,
    requirements,
    companyBrief
  });

  // STAGE 4: Generate Technical Questions
  reportProgress(4, 'Generating technical questions linked to requirements');
  const technicalQuestions = await executeStage4GenerateTechnicalQuestions(provider, {
    requirements,
    roleBreakdown,
    companyBrief
  });

  // STAGE 5: Generate Behavioural Questions
  reportProgress(5, 'Generating behavioral questions linked to requirements');
  const behavioralQuestions = await executeStage5GenerateBehavioralQuestions(provider, {
    requirements,
    roleBreakdown,
    companyBrief
  });

  // STAGE 6: Generate System Design Questions (where appropriate)
  reportProgress(6, 'Evaluating and generating system design questions');
  const systemDesignResult = await executeStage6GenerateSystemDesignQuestions(provider, {
    requirements,
    roleBreakdown,
    companyBrief
  });
  const systemDesignQuestions = systemDesignResult.questions || [];

  // STAGE 7: Generate Company-Fit Questions
  reportProgress(7, 'Generating company fit and culture questions');
  const companyFitQuestions = await executeStage7GenerateCompanyFitQuestions(provider, {
    requirements,
    roleBreakdown,
    companyBrief
  });

  // STAGE 8: Generate High-Yield Flashcards
  reportProgress(8, 'Generating bite-sized revision flashcards');
  const flashcards = await executeStage8GenerateFlashcards(provider, {
    requirements,
    technicalQuestions,
    companyBrief
  });

  // Compile Modules for DB Storage & Unified Question Navigation
  const modules = [
    {
      moduleId: 'mod-tech',
      title: 'Technical Deep Dive',
      type: 'TECHNICAL',
      priority: 'CRITICAL',
      questions: technicalQuestions.map(q => ({
        questionId: q.id,
        prompt: q.question,
        category: 'TECHNICAL_DEEP_DIVE',
        difficulty: q.difficulty,
        competencyIds: q.targetRequirementIds,
        estimatedMinutes: q.estimatedMinutes,
        answerFramework: q.answerFramework,
        rubric: q.rubric,
        followUpProbes: q.followUpProbes
      }))
    },
    {
      moduleId: 'mod-behav',
      title: 'Behavioral & Leadership',
      type: 'BEHAVIORAL',
      priority: 'HIGH',
      questions: behavioralQuestions.map(q => ({
        questionId: q.id,
        prompt: q.question,
        category: 'BEHAVIORAL',
        difficulty: q.difficulty,
        competencyIds: q.targetRequirementIds,
        estimatedMinutes: q.estimatedMinutes,
        answerFramework: q.answerFramework,
        rubric: q.rubric,
        followUpProbes: q.followUpProbes
      }))
    }
  ];

  if (systemDesignQuestions.length > 0) {
    modules.push({
      moduleId: 'mod-sys',
      title: 'System Design & Architecture',
      type: 'SYSTEM_DESIGN',
      priority: 'HIGH',
      questions: systemDesignQuestions.map(q => ({
        questionId: q.id,
        prompt: q.question,
        category: 'SYSTEM_DESIGN',
        difficulty: q.difficulty,
        competencyIds: q.targetRequirementIds,
        estimatedMinutes: q.estimatedMinutes,
        answerFramework: q.answerFramework,
        rubric: q.rubric,
        followUpProbes: q.followUpProbes
      }))
    });
  }

  if (companyFitQuestions.length > 0) {
    modules.push({
      moduleId: 'mod-fit',
      title: 'Company Alignment & Culture',
      type: 'COMPANY_SPECIFIC',
      priority: 'MEDIUM',
      questions: companyFitQuestions.map(q => ({
        questionId: q.id,
        prompt: q.question,
        category: 'TECHNICAL_DEEP_DIVE',
        difficulty: q.difficulty,
        competencyIds: q.targetRequirementIds,
        estimatedMinutes: q.estimatedMinutes,
        answerFramework: q.answerFramework,
        rubric: q.rubric,
        followUpProbes: q.followUpProbes
      }))
    });
  }

  // 9. Deterministic Coverage Checking & Targeted Remediation Loop
  const allInitialQuestions = [
    ...technicalQuestions,
    ...behavioralQuestions,
    ...systemDesignQuestions,
    ...companyFitQuestions
  ];

  const remediationResult = await remediateCoverageGaps({
    requirements,
    existingQuestions: allInitialQuestions,
    roleBreakdown,
    companyBrief,
    provider,
    maxPasses: 1
  });

  // Append any remediated questions into the technical module
  if (remediationResult.remediatedQuestions.length > 0) {
    const techMod = modules.find(m => m.moduleId === 'mod-tech');
    remediationResult.remediatedQuestions.forEach(q => {
      const qObj = {
        questionId: q.id,
        prompt: q.question,
        category: q.category || 'TECHNICAL_DEEP_DIVE',
        difficulty: q.difficulty || 'MID',
        competencyIds: q.targetRequirementIds,
        estimatedMinutes: q.estimatedMinutes || 20,
        answerFramework: q.answerFramework,
        rubric: q.rubric,
        followUpProbes: q.followUpProbes || []
      };
      if (techMod) {
        techMod.questions.push(qObj);
      }
    });
  }

  const finalQuestions = remediationResult.allQuestions;
  const coverageScore = remediationResult.coverageScore;
  const uncoveredGaps = remediationResult.remainingGaps.map(g => `[${g.id}] ${g.text}`);

  // 10. Deterministic Schedule Allocation (1 to 60 days)
  const schedule = allocateSchedule({
    questions: finalQuestions,
    requirements,
    totalDays
  });

  return {
    targetRole,
    targetCompany,
    companyUrl,
    jobDescriptionRaw,
    candidateResumeRaw,
    requirements,
    isSparseJd,
    insufficientInfoNotes,
    companyBrief,
    roleBreakdown,
    systemDesignApplicable: systemDesignResult.isApplicable,
    systemDesignReason: systemDesignResult.reason,
    questions: {
      technical: technicalQuestions,
      behavioral: behavioralQuestions,
      systemDesign: systemDesignQuestions,
      companyFit: companyFitQuestions
    },
    modules,
    flashcards,
    coverageScore,
    weightedCoverageScore: remediationResult.weightedCoverageScore,
    uncoveredGaps,
    remediationStatus: remediationResult.status,
    schedule,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Validates kit structure against the Trao schema contracts.
 * 
 * @param {object} kit 
 * @returns {{ isValid: boolean }}
 */
export function validateKitStructure(kit) {
  if (!kit || typeof kit !== 'object') {
    throw new Error('Kit must be a non-null object');
  }

  const requiredArrays = ['requirements', 'modules', 'flashcards', 'schedule'];
  for (const field of requiredArrays) {
    if (!Array.isArray(kit[field])) {
      throw new Error(`Invalid kit payload: missing or non-array field "${field}"`);
    }
  }

  if (kit.requirements.length === 0) {
    throw new Error('Invalid kit payload: requirements list cannot be empty');
  }

  for (const req of kit.requirements) {
    if (!req.id || !req.text || !req.kind || !req.priority) {
      throw new Error(`Invalid requirement in kit: ${JSON.stringify(req)}`);
    }
  }

  if (!kit.companyBrief || typeof kit.companyBrief !== 'object') {
    throw new Error('Invalid kit payload: missing or malformed companyBrief');
  }

  if (!kit.roleBreakdown || typeof kit.roleBreakdown !== 'object') {
    throw new Error('Invalid kit payload: missing or malformed roleBreakdown');
  }

  if (typeof kit.coverageScore !== 'number' || kit.coverageScore < 0 || kit.coverageScore > 100) {
    throw new Error(`Invalid kit payload: coverageScore must be a number between 0 and 100, got ${kit.coverageScore}`);
  }

  return { isValid: true };
}

/**
 * Shared End-to-End Prep Kit Orchestrator.
 * Used by both the Express web controller (kitController.js) and the CLI Batch Evaluator (evaluate.js).
 * 
 * Guarantees zero duplicate implementation.
 * 
 * 1. Resolves/normalizes targetRole and targetCompany if absent.
 * 2. Crawls company website with relative link discovery and localhost support.
 * 3. Executes the 8-stage decoupled LLM generation pipeline.
 * 4. Runs deterministic coverage check and remediation.
 * 5. Deterministically allocates study schedule for requested days.
 * 6. Validates final kit structure before returning.
 * 
 * @param {object} options
 * @returns {Promise<object>} Complete validated Prep Kit object
 */
export async function generateCompleteKit(options = {}) {
  const jd = (options.jd || options.jobDescriptionRaw || options.jobDescription || '').trim();
  if (!jd) {
    throw new Error('Job description is required to generate an interview prep kit.');
  }

  const companyUrl = (options.company_url || options.companyUrl || '').trim();
  const totalDays = parseInt(options.days || options.totalDays, 10) || 7;
  const allowLocalhost = options.allowLocalhost !== undefined ? options.allowLocalhost : true;
  const providerName = options.providerName || null;
  const candidateResumeRaw = (options.candidateResume || options.candidateResumeRaw || '').trim();
  const onProgress = options.onProgress || null;

  // Derive targetCompany if not provided
  let targetCompany = (options.targetCompany || options.company || '').trim();
  if (!targetCompany && companyUrl) {
    try {
      const parsedUrl = new URL(companyUrl.startsWith('http') ? companyUrl : `http://${companyUrl}`);
      const hostname = parsedUrl.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        targetCompany = 'Localhost Test Company';
      } else {
        const parts = hostname.replace(/^www\./, '').split('.');
        targetCompany = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Target Company';
      }
    } catch {
      targetCompany = 'Target Company';
    }
  }
  if (!targetCompany) {
    targetCompany = 'Target Company';
  }

  // Derive targetRole if not provided
  let targetRole = (options.targetRole || options.role || '').trim();
  if (!targetRole) {
    const firstLine = jd.split('\n')[0].replace(/[#*_-]/g, '').trim();
    if (firstLine.length > 3 && firstLine.length < 60) {
      targetRole = firstLine;
    } else {
      targetRole = 'Software Engineer';
    }
  }

  // 1. Crawl website if companyUrl provided (with relative link discovery and localhost support)
  let scrapedPages = options.scrapedPages || [];
  if (companyUrl && scrapedPages.length === 0) {
    try {
      const crawlResult = await crawlCompany(companyUrl, {
        allowLocalhost,
        maxPages: options.maxPages || 4,
        maxDepth: options.maxDepth || 2,
        timeout: options.timeout || 4000
      });
      scrapedPages = crawlResult.pages || [];
    } catch (crawlErr) {
      console.warn(`[Pipeline Warning] Crawl on ${companyUrl} failed: ${crawlErr.message}. Continuing with fallback.`);
    }
  }

  // 2. Execute 8-Stage Decoupled LLM Pipeline + Coverage Remediation + Schedule Allocation
  const kit = await generatePrepKitPipeline({
    targetRole,
    targetCompany,
    companyUrl,
    jobDescriptionRaw: jd,
    candidateResumeRaw,
    scrapedPages,
    providerName,
    totalDays,
    onProgress
  });

  // 3. Validate every resulting kit
  validateKitStructure(kit);

  return kit;
}

export default {
  generatePrepKitPipeline,
  generateCompleteKit,
  validateKitStructure
};
