import { parseLlmJson } from '../resilience/jsonParser.js';
import { executeWithRetry } from '../resilience/retryWithBackoff.js';
import { validateQuestions } from '../resilience/schemaValidator.js';

const SYSTEM_PROMPT = `You are a Principal Systems Architect and Staff interviewer.
Your task is to determine whether System Design questions are appropriate for this role, and if so, generate realistic large-scale architectural scenarios.

SUITABILITY CRITERIA:
- Appropriate for: Senior/Staff/Lead/Principal roles, or roles involving Backend, Distributed Systems, Fullstack, Cloud, DevOps, SRE, Data Engineering, Infrastructure, or Database architecture.
- NOT appropriate for: Entry/Junior roles, purely UI/Visual designers, non-technical positions.
- If NOT appropriate: Return {"isApplicable": false, "reason": "...", "questions": []}.
- If appropriate: Return {"isApplicable": true, "reason": "...", "questions": [...]}.

CRITICAL RULES FOR QUESTIONS:
1. EVERY question MUST include "targetRequirementIds" matching the provided requirement IDs.
2. Every question must include:
   - "id": Stable identifier (e.g. "q-sys-1")
   - "question": High-scale distributed system problem statement (throughput, latency, partitioning, fault-tolerance)
   - "targetRequirementIds": Array of valid requirement IDs
   - "difficulty": "SENIOR" | "STAFF"
   - "category": "SYSTEM_DESIGN"
   - "estimatedMinutes": 30-45
   - "answerFramework": Object with "approach", "keyPointsToCover" (array), and "commonTraps" (array)
   - "rubric": 5-point evaluation scale with "criteria", "level1Deficient", "level3Acceptable", and "level5Exceptional"
   - "followUpProbes": 1-2 realistic follow-up probes (e.g. partition failure, data center outage)

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "isApplicable": true,
  "reason": "Senior Backend Engineer role requires distributed systems and high-throughput architecture design",
  "questions": [
    {
      "id": "q-sys-1",
      "question": "Design a distributed...",
      "targetRequirementIds": ["req-tech-1"],
      "difficulty": "SENIOR",
      "category": "SYSTEM_DESIGN",
      "estimatedMinutes": 30,
      "answerFramework": {
        "approach": "Outline requirements, scale estimation, high-level API, data model, and failure recovery",
        "keyPointsToCover": ["Idempotency", "Consensus", "Partitioning"],
        "commonTraps": ["Single point of failure"]
      },
      "rubric": {
        "criteria": "High-scale architectural trade-offs",
        "level1Deficient": "Naive single server design",
        "level3Acceptable": "Standard partitioned microservices design",
        "level5Exceptional": "Addresses split-brain, consensus, latency budgets, and disaster recovery"
      },
      "followUpProbes": ["How would you handle a cross-region replication lag spike?"]
    }
  ]
}`;

/**
 * Deterministic pre-check for role suitability to assist the LLM
 */
export function isSystemDesignLikelyApplicable(targetRole = '', seniority = '') {
  const normalizedRole = targetRole.toLowerCase();
  const normalizedSeniority = seniority.toLowerCase();

  const isSeniorOrAbove = 
    normalizedSeniority.includes('senior') || 
    normalizedSeniority.includes('staff') || 
    normalizedSeniority.includes('principal') || 
    normalizedSeniority.includes('lead') || 
    normalizedSeniority.includes('architect') ||
    normalizedRole.includes('senior') ||
    normalizedRole.includes('staff') ||
    normalizedRole.includes('lead') ||
    normalizedRole.includes('architect');

  const isSystemRole = 
    normalizedRole.includes('backend') || 
    normalizedRole.includes('fullstack') || 
    normalizedRole.includes('distributed') || 
    normalizedRole.includes('cloud') || 
    normalizedRole.includes('infra') || 
    normalizedRole.includes('devops') || 
    normalizedRole.includes('sre') || 
    normalizedRole.includes('data') || 
    normalizedRole.includes('platform');

  return isSeniorOrAbove || isSystemRole;
}

export async function executeStage6GenerateSystemDesignQuestions(provider, { requirements = [], roleBreakdown = {}, companyBrief = {} }) {
  const title = roleBreakdown.title || '';
  const seniority = roleBreakdown.seniority || '';

  // If role is explicitly junior/intern and non-backend, we can safely omit system design deterministically
  if (!isSystemDesignLikelyApplicable(title, seniority) && (seniority.toLowerCase().includes('entry') || seniority.toLowerCase().includes('junior') || seniority.toLowerCase().includes('intern'))) {
    return {
      isApplicable: false,
      reason: `System design omitted: Role is entry-level (${seniority} ${title})`,
      questions: []
    };
  }

  const technicalReqs = requirements.filter(r => r.kind === 'technical' || r.kind === 'domain');
  const validRequirementIds = (technicalReqs.length > 0 ? technicalReqs : requirements).map(r => r.id);
  const reqSummary = validRequirementIds.map(id => {
    const req = requirements.find(r => r.id === id);
    return `ID: "${req.id}" | Skill: ${req.text}`;
  }).join('\n');

  const userPrompt = `ROLE: ${title} (${seniority})
COMPANY OVERVIEW: ${companyBrief.overview || 'Tech Company'}
COMPANY TECH STACK: ${(companyBrief.techStack || []).join(', ') || 'Modern Stack'}

REQUIREMENTS TO REFERENCE (targetRequirementIds MUST use these exact IDs):
${reqSummary}

Determine suitability and generate 1 to 2 comprehensive system design interview problems if appropriate.`;

  return await executeWithRetry(async (attempt) => {
    const temperature = attempt === 0 ? 0.3 : 0.1;
    const response = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature,
      responseFormat: 'json'
    });

    const parsed = parseLlmJson(response.content);

    if (parsed.isApplicable === false || (Array.isArray(parsed.questions) && parsed.questions.length === 0)) {
      return {
        isApplicable: false,
        reason: parsed.reason || 'System design questions not required for this role level.',
        questions: []
      };
    }

    const validatedQuestions = validateQuestions(parsed, validRequirementIds, 'Stage6_SystemDesignQuestions');
    return {
      isApplicable: true,
      reason: parsed.reason || 'Role requires distributed architecture and scalability assessment.',
      questions: validatedQuestions
    };
  }, {
    maxRetries: 2,
    baseDelayMs: 400
  });
}

export default {
  executeStage6GenerateSystemDesignQuestions,
  isSystemDesignLikelyApplicable
};
