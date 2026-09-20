import { parseLlmJson } from '../resilience/jsonParser.js';
import { executeWithRetry } from '../resilience/retryWithBackoff.js';
import { validateQuestions } from '../resilience/schemaValidator.js';

const SYSTEM_PROMPT = `You are a senior technical interviewer and bar-raiser at a top tech company.
Your task is to generate rigorous, realistic Technical Questions that directly test the candidate's mastery of the technical requirements.

CRITICAL RULES:
1. EVERY question MUST include "targetRequirementIds" containing one or more exact requirement IDs provided in the prompt.
2. DO NOT reference IDs that were not provided in the requirements list.
3. Every question must include:
   - "id": Stable identifier (e.g. "q-tech-1")
   - "question": Direct, realistic interview question testing implementation, architecture, debugging, or edge cases
   - "targetRequirementIds": Array of valid requirement ID strings
   - "difficulty": "ENTRY" | "MID" | "SENIOR" | "STAFF"
   - "category": "TECHNICAL_DEEP_DIVE" or "CODING"
   - "estimatedMinutes": Realistic time budget (e.g. 15-25 minutes)
   - "answerFramework": Object with "approach", "keyPointsToCover" (array), and "commonTraps" (array)
   - "rubric": 5-point evaluation scale with "criteria", "level1Deficient", "level3Acceptable", and "level5Exceptional"
   - "followUpProbes": 1-2 realistic follow-up questions an interviewer would ask to probe depth

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "questions": [
    {
      "id": "q-tech-1",
      "question": "How do you handle...",
      "targetRequirementIds": ["req-tech-1"],
      "difficulty": "SENIOR",
      "category": "TECHNICAL_DEEP_DIVE",
      "estimatedMinutes": 20,
      "answerFramework": {
        "approach": "Systematic breakdown of...",
        "keyPointsToCover": ["Point 1", "Point 2"],
        "commonTraps": ["Trap 1"]
      },
      "rubric": {
        "criteria": "Understanding of...",
        "level1Deficient": "Description of weak answer",
        "level3Acceptable": "Description of solid answer",
        "level5Exceptional": "Description of masterclass answer"
      },
      "followUpProbes": ["Follow-up question 1"]
    }
  ]
}`;

export async function executeStage4GenerateTechnicalQuestions(provider, { requirements = [], roleBreakdown = {}, companyBrief = {} }) {
  const technicalReqs = requirements.filter(r => r.kind === 'technical' || r.kind === 'domain');
  const validRequirementIds = technicalReqs.map(r => r.id);

  if (technicalReqs.length === 0) {
    // If no technical requirements were specified, fallback to all available requirements
    requirements.forEach(r => validRequirementIds.push(r.id));
  }

  const reqSummary = technicalReqs.map(r => `ID: "${r.id}" | Priority: ${r.priority} | Skill: ${r.text}`).join('\n');

  const userPrompt = `ROLE: ${roleBreakdown.title || 'Software Engineer'} (${roleBreakdown.seniority || 'Mid'})
CORE FOCUS: ${roleBreakdown.coreFocus || 'General Engineering'}
TECH STACK: ${(companyBrief.techStack || []).join(', ') || 'Modern Stack'}

AVAILABLE TECHNICAL REQUIREMENTS (You MUST reference these exact IDs in targetRequirementIds):
${reqSummary}

Generate 2 to 4 high-yield technical interview questions that test these specific requirements.
Ensure each question links strictly to the requirement IDs above.`;

  return await executeWithRetry(async (attempt) => {
    const temperature = attempt === 0 ? 0.4 : 0.2;
    const response = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature,
      responseFormat: 'json'
    });

    const parsed = parseLlmJson(response.content);
    return validateQuestions(parsed, validRequirementIds, 'Stage4_TechnicalQuestions');
  }, {
    maxRetries: 2,
    baseDelayMs: 400
  });
}

export default {
  executeStage4GenerateTechnicalQuestions
};
