import { parseLlmJson } from '../resilience/jsonParser.js';
import { executeWithRetry } from '../resilience/retryWithBackoff.js';
import { validateQuestions } from '../resilience/schemaValidator.js';

const SYSTEM_PROMPT = `You are an expert executive talent partner and behavioral interviewer.
Your task is to generate targeted Behavioral Questions evaluating leadership, collaboration, conflict resolution, and ownership.

CRITICAL RULES:
1. EVERY question MUST include "targetRequirementIds" referencing the provided requirement IDs.
2. Formulate questions based on the STAR methodology (Situation, Task, Action, Result).
3. Every question must include:
   - "id": Stable identifier (e.g. "q-behav-1")
   - "question": Concrete behavioral situation prompt (e.g. "Tell me about a time when...")
   - "targetRequirementIds": Array of valid requirement ID strings
   - "difficulty": "MID" | "SENIOR" | "STAFF"
   - "category": "BEHAVIORAL"
   - "estimatedMinutes": Realistic time budget (e.g. 15 minutes)
   - "answerFramework": Object with "approach" (STAR guide), "keyPointsToCover" (array), and "commonTraps" (array)
   - "rubric": 5-point evaluation scale with "criteria", "level1Deficient", "level3Acceptable", and "level5Exceptional"
   - "followUpProbes": 1-2 realistic follow-up probes to test authenticity

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "questions": [
    {
      "id": "q-behav-1",
      "question": "Tell me about a time when you disagreed with an engineering decision...",
      "targetRequirementIds": ["req-behav-1"],
      "difficulty": "SENIOR",
      "category": "BEHAVIORAL",
      "estimatedMinutes": 15,
      "answerFramework": {
        "approach": "Use STAR method emphasizing data-driven persuasion and team commitment",
        "keyPointsToCover": ["Quantifiable disagreement", "Active listening", "Commitment to outcome"],
        "commonTraps": ["Speaking negatively of peers or failing to disagree and commit"]
      },
      "rubric": {
        "criteria": "Conflict resolution and collaborative alignment",
        "level1Deficient": "Defensive or rigid; avoids personal accountability",
        "level3Acceptable": "Presents perspective constructively and accepts consensus",
        "level5Exceptional": "Used objective metrics, aligned diverging priorities, and maintained high team morale"
      },
      "followUpProbes": ["What would you have done differently if the team had rejected your suggestion?"]
    }
  ]
}`;

export async function executeStage5GenerateBehavioralQuestions(provider, { requirements = [], roleBreakdown = {}, companyBrief = {} }) {
  // Target behavioral and experience requirements first, fallback to all requirements
  const behavioralReqs = requirements.filter(r => r.kind === 'behavioral' || r.kind === 'experience');
  const validRequirementIds = requirements.map(r => r.id);

  const reqSummary = (behavioralReqs.length > 0 ? behavioralReqs : requirements)
    .map(r => `ID: "${r.id}" | Kind: ${r.kind} | Priority: ${r.priority} | Text: ${r.text}`)
    .join('\n');

  const userPrompt = `ROLE: ${roleBreakdown.title || 'Software Engineer'} (${roleBreakdown.seniority || 'Mid'})
COMPANY CULTURE: ${companyBrief.interviewCulture || 'High ownership, transparent feedback, team collaboration'}
MISSION & VALUES: ${(companyBrief.missionValues || []).join('; ') || 'Standard values'}

AVAILABLE REQUIREMENTS (You MUST reference these exact IDs in targetRequirementIds):
${reqSummary}

Generate 2 to 3 behavioral questions evaluating how the candidate navigates team dynamics, technical conflict, and project delivery.`;

  return await executeWithRetry(async (attempt) => {
    const temperature = attempt === 0 ? 0.4 : 0.2;
    const response = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature,
      responseFormat: 'json'
    });

    const parsed = parseLlmJson(response.content);
    return validateQuestions(parsed, validRequirementIds, 'Stage5_BehavioralQuestions');
  }, {
    maxRetries: 2,
    baseDelayMs: 400
  });
}

export default {
  executeStage5GenerateBehavioralQuestions
};
