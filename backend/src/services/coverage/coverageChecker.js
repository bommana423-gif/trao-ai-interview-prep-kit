/**
 * Deterministic Coverage Checker for Trao Interview Prep Kits.
 * Inspects requirement IDs on every question to determine exact coverage.
 * 
 * NOTE: This module is 100% deterministic code. It NEVER queries an LLM
 * to determine whether a requirement is covered.
 */

/**
 * Checks coverage of a set of requirements across a set of questions.
 *
 * @param {Array<{ id: string, text: string, kind: string, priority: string }>} requirements
 * @param {Array<{ id: string, question?: string, targetRequirementIds?: string[], competencyIds?: string[] }>} questions
 * @returns {{
 *   totalRequirements: number,
 *   covered_requirement_ids: string[],
 *   uncovered_requirement_ids: string[],
 *   covered_must_haves: string[],
 *   uncovered_must_haves: string[],
 *   coverageScore: number,
 *   weightedCoverageScore: number,
 *   isFullyCovered: boolean,
 *   requirementCoverageMap: Object.<string, { requirement: Object, questionIds: string[] }>
 * }}
 */
export function checkCoverage(requirements = [], questions = []) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return {
      totalRequirements: 0,
      covered_requirement_ids: [],
      uncovered_requirement_ids: [],
      covered_must_haves: [],
      uncovered_must_haves: [],
      coverageScore: 100,
      weightedCoverageScore: 100,
      isFullyCovered: true,
      requirementCoverageMap: {}
    };
  }

  // 1. Initialize Inverted Index
  const requirementCoverageMap = {};
  const allReqIdSet = new Set();
  const mustHaveReqIdSet = new Set();

  requirements.forEach(req => {
    allReqIdSet.add(req.id);
    if (req.priority === 'must-have') {
      mustHaveReqIdSet.add(req.id);
    }
    requirementCoverageMap[req.id] = {
      requirement: req,
      questionIds: []
    };
  });

  // 2. Inspect targetRequirementIds on every question
  questions.forEach(q => {
    const questionId = q.id || q.questionId;
    const targetIds = q.targetRequirementIds || q.competencyIds || [];

    if (Array.isArray(targetIds)) {
      targetIds.forEach(reqId => {
        if (allReqIdSet.has(reqId)) {
          if (!requirementCoverageMap[reqId].questionIds.includes(questionId)) {
            requirementCoverageMap[reqId].questionIds.push(questionId);
          }
        }
      });
    }
  });

  // 3. Partition into Covered and Uncovered Sets
  const covered_requirement_ids = [];
  const uncovered_requirement_ids = [];
  const covered_must_haves = [];
  const uncovered_must_haves = [];

  let totalWeight = 0;
  let coveredWeight = 0;

  requirements.forEach(req => {
    const isMustHave = req.priority === 'must-have';
    const weight = isMustHave ? 2 : 1;
    totalWeight += weight;

    const coveringQuestions = requirementCoverageMap[req.id].questionIds;
    if (coveringQuestions.length > 0) {
      covered_requirement_ids.push(req.id);
      coveredWeight += weight;
      if (isMustHave) {
        covered_must_haves.push(req.id);
      }
    } else {
      uncovered_requirement_ids.push(req.id);
      if (isMustHave) {
        uncovered_must_haves.push(req.id);
      }
    }
  });

  // 4. Compute Deterministic Mathematical Scores
  const totalCount = requirements.length;
  const coveredCount = covered_requirement_ids.length;

  const coverageScore = totalCount > 0 
    ? Math.round((coveredCount / totalCount) * 100) 
    : 100;

  const weightedCoverageScore = totalWeight > 0 
    ? Math.round((coveredWeight / totalWeight) * 100) 
    : 100;

  return {
    totalRequirements: totalCount,
    covered_requirement_ids,
    uncovered_requirement_ids,
    covered_must_haves,
    uncovered_must_haves,
    coverageScore,
    weightedCoverageScore,
    isFullyCovered: uncovered_requirement_ids.length === 0,
    requirementCoverageMap
  };
}

export default {
  checkCoverage
};
