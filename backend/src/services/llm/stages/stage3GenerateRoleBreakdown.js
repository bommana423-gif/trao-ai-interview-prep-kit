import { parseLlmJson } from '../resilience/jsonParser.js';
import { executeWithRetry } from '../resilience/retryWithBackoff.js';
import { validateRoleBreakdown } from '../resilience/schemaValidator.js';

const SYSTEM_PROMPT = `You are a principal engineering hiring manager.
Your task is to analyze the extracted job requirements and company profile to produce a comprehensive Role Breakdown.

CRITICAL RULES:
1. Synthesize realistic expectations for the role's seniority level, core focus, and engineering challenges.
2. Align the breakdown strictly with the extracted requirements and company tech stack.
3. Keep points concrete and actionable for interview preparation.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "roleBreakdown": {
    "title": "Exact role title",
    "seniority": "Entry | Mid | Senior | Staff | Lead",
    "coreFocus": "Primary architectural or product mission of the role",
    "dayToDayResponsibilities": [
      "Responsibility 1",
      "Responsibility 2"
    ],
    "primaryChallenges": [
      "Technical challenge 1",
      "Domain bottleneck 2"
    ],
    "successCriteria": [
      "Key milestone or success metric 1",
      "Key milestone 2"
    ]
  }
}`;

export async function executeStage3GenerateRoleBreakdown(provider, { targetRole, requirements = [], companyBrief = {} }) {
  const reqSummary = requirements.map(r => `- [${r.id}] (${r.kind}, ${r.priority}): ${r.text}`).join('\n');

  const userPrompt = `TARGET ROLE: ${targetRole}
COMPANY: ${companyBrief.overview || 'General Technology Company'}
TECH STACK: ${(companyBrief.techStack || []).join(', ') || 'Standard modern stack'}

EXTRACTED REQUIREMENTS:
${reqSummary}

Generate the detailed Role Breakdown strictly in the requested JSON structure.`;

  return await executeWithRetry(async (attempt) => {
    const temperature = attempt === 0 ? 0.3 : 0.1;
    const response = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature,
      responseFormat: 'json'
    });

    const parsed = parseLlmJson(response.content);
    return validateRoleBreakdown(parsed);
  }, {
    maxRetries: 2,
    baseDelayMs: 400
  });
}

export default {
  executeStage3GenerateRoleBreakdown
};
