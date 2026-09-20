import { checkCoverage } from './coverageChecker.js';
import { parseLlmJson } from '../llm/resilience/jsonParser.js';
import { executeWithRetry } from '../llm/resilience/retryWithBackoff.js';
import { validateQuestions } from '../llm/resilience/schemaValidator.js';

const REMEDIATION_SYSTEM_PROMPT = `You are a precision technical interview curriculum architect.
Your task is to generate TARGETED interview questions EXCLUSIVELY for the specified uncovered job requirements.

CRITICAL RULES:
1. ONLY generate questions for the explicit uncovered requirement IDs listed.
2. Every question's "targetRequirementIds" MUST reference the exact uncovered requirement ID it was generated for.
3. Formulate rigorous questions with clear rubrics and STAR answer frameworks.
4. Output format: Return ONLY a valid JSON object matching {"questions": [...]}.`;

/**
 * Invokes LLM provider to generate targeted questions strictly for uncovered requirements.
 */
export async function generateTargetedMissingQuestions(provider, { uncoveredRequirements = [], roleBreakdown = {}, companyBrief = {} }) {
  if (!Array.isArray(uncoveredRequirements) || uncoveredRequirements.length === 0) {
    return [];
  }

  const validRequirementIds = uncoveredRequirements.map(r => r.id);
  const targetReqList = uncoveredRequirements
    .map(r => `- [${r.id}] (${r.kind}, ${r.priority}): ${r.text}`)
    .join('\n');

  const userPrompt = `ROLE: ${roleBreakdown.title || 'Software Engineer'} (${roleBreakdown.seniority || 'Mid'})
TECH STACK: ${(companyBrief.techStack || []).join(', ') || 'Standard Stack'}

UNCOVERED REQUIREMENTS TO REMEDIATE (targetRequirementIds MUST strictly use these exact IDs):
${targetReqList}

Generate exactly 1 targeted, high-yield interview question for EACH uncovered requirement above.
Do not generate questions for any other topics.`;

  return await executeWithRetry(async (attempt) => {
    const temperature = attempt === 0 ? 0.3 : 0.1;
    const response = await provider.generate({
      systemPrompt: REMEDIATION_SYSTEM_PROMPT,
      userPrompt,
      temperature,
      responseFormat: 'json'
    });

    const parsed = parseLlmJson(response.content);
    return validateQuestions(parsed, validRequirementIds, 'Coverage_Remediation');
  }, {
    maxRetries: 2,
    baseDelayMs: 400
  });
}

/**
 * Runs a deterministic coverage check, targeted remediation loop, and second coverage verification.
 * Strictly limits correction passes and honestly reports any remaining gaps.
 *
 * @param {Object} params
 * @param {Array} params.requirements - Complete set of job requirements
 * @param {Array} params.existingQuestions - Questions currently in the kit
 * @param {Object} [params.roleBreakdown]
 * @param {Object} [params.companyBrief]
 * @param {Object} params.provider - LLM provider instance
 * @param {number} [params.maxPasses=1] - Hard upper limit on correction passes
 * @returns {Promise<Object>}
 */
export async function remediateCoverageGaps({
  requirements = [],
  existingQuestions = [],
  roleBreakdown = {},
  companyBrief = {},
  provider,
  maxPasses = 1
}) {
  // 1. Initial 100% Deterministic Coverage Check (Never ask LLM)
  const initialCoverage = checkCoverage(requirements, existingQuestions);

  if (initialCoverage.isFullyCovered) {
    return {
      status: 'FULL_COVERAGE',
      passesExecuted: 0,
      initialCoverage,
      finalCoverage: initialCoverage,
      coverageScore: 100,
      uncovered_requirement_ids: [],
      remainingGaps: [],
      allQuestions: existingQuestions,
      remediatedQuestions: []
    };
  }

  let currentQuestions = [...existingQuestions];
  const allRemediatedQuestions = [];
  let passesExecuted = 0;

  // 2. Bounded Remediation Loop
  while (passesExecuted < maxPasses) {
    const loopCoverage = checkCoverage(requirements, currentQuestions);

    if (loopCoverage.isFullyCovered) {
      break;
    }

    const uncoveredReqs = requirements.filter(r => 
      loopCoverage.uncovered_requirement_ids.includes(r.id)
    );

    if (uncoveredReqs.length === 0) {
      break;
    }

    // Generate questions strictly for uncovered requirements
    try {
      const newQuestions = await generateTargetedMissingQuestions(provider, {
        uncoveredRequirements: uncoveredReqs,
        roleBreakdown,
        companyBrief
      });

      if (Array.isArray(newQuestions) && newQuestions.length > 0) {
        // Tag remediated questions
        newQuestions.forEach(q => {
          q.isRemediated = true;
          q.remediationPass = passesExecuted + 1;
        });

        currentQuestions.push(...newQuestions);
        allRemediatedQuestions.push(...newQuestions);
      }
    } catch (err) {
      console.warn(`[Coverage Remediation] Warning in pass ${passesExecuted + 1}: ${err.message}`);
    }

    passesExecuted++;
  }

  // 3. Second / Final Deterministic Coverage Check
  const finalCoverage = checkCoverage(requirements, currentQuestions);

  // 4. Final Honest Gap Identification (Never mask remaining gaps)
  const remainingGaps = finalCoverage.uncovered_requirement_ids.map(id => {
    const req = requirements.find(r => r.id === id);
    return {
      id,
      text: req?.text || 'Unknown requirement',
      kind: req?.kind || 'unknown',
      priority: req?.priority || 'must-have'
    };
  });

  return {
    status: finalCoverage.isFullyCovered ? 'REMEDIATED' : 'PARTIALLY_REMEDIATED',
    passesExecuted,
    initialCoverage,
    finalCoverage,
    coverageScore: finalCoverage.coverageScore,
    weightedCoverageScore: finalCoverage.weightedCoverageScore,
    uncovered_requirement_ids: finalCoverage.uncovered_requirement_ids,
    remainingGaps,
    allQuestions: currentQuestions,
    remediatedQuestions: allRemediatedQuestions
  };
}

export default {
  remediateCoverageGaps,
  generateTargetedMissingQuestions
};
