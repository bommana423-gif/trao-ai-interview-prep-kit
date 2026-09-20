import { parseLlmJson } from '../resilience/jsonParser.js';
import { executeWithRetry } from '../resilience/retryWithBackoff.js';
import { validateQuestions } from '../resilience/schemaValidator.js';

const SYSTEM_PROMPT = `You are a Lead Hiring Partner and Culture Alignment Evaluator.
Your task is to generate realistic Company-Fit Questions that test candidate alignment with the company's specific domain, business model, mission, and operating principles.

CRITICAL RULES:
1. EVERY question MUST include "targetRequirementIds" referencing the provided requirement IDs.
2. Formulate questions that require the candidate to demonstrate understanding of the company's specific product ecosystem, operational challenges, and values.
3. Every question must include:
   - "id": Stable identifier (e.g. "q-fit-1")
   - "question": Specific question connecting the company's product/mission with candidate experience
   - "targetRequirementIds": Array of valid requirement ID strings
   - "difficulty": "MID" | "SENIOR"
   - "category": "COMPANY_SPECIFIC"
   - "estimatedMinutes": 10-15
   - "answerFramework": Object with "approach", "keyPointsToCover" (array), and "commonTraps" (array)
   - "rubric": 5-point evaluation scale with "criteria", "level1Deficient", "level3Acceptable", and "level5Exceptional"
   - "followUpProbes": 1 realistic follow-up probe

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "questions": [
    {
      "id": "q-fit-1",
      "question": "At Acme, our payment gateway processes millions in transactions...",
      "targetRequirementIds": ["req-domain-1"],
      "difficulty": "SENIOR",
      "category": "COMPANY_SPECIFIC",
      "estimatedMinutes": 15,
      "answerFramework": {
        "approach": "Connect personal reliability standards with company mission",
        "keyPointsToCover": ["Domain awareness", "Customer impact", "Values alignment"],
        "commonTraps": ["Generic answers that could apply to any generic company"]
      },
      "rubric": {
        "criteria": "Genuine company understanding and values synergy",
        "level1Deficient": "Gives canned generic response with no awareness of company domain",
        "level3Acceptable": "Understands primary business model and references core company values",
        "level5Exceptional": "Deep strategic alignment, discusses business trade-offs, and shows enthusiasm for product mission"
      },
      "followUpProbes": ["What specific aspect of our engineering blog caught your attention?"]
    }
  ]
}`;

export async function executeStage7GenerateCompanyFitQuestions(provider, { requirements = [], roleBreakdown = {}, companyBrief = {} }) {
  const validRequirementIds = requirements.map(r => r.id);

  const valuesSummary = Array.isArray(companyBrief.missionValues) ? companyBrief.missionValues.join(', ') : 'Excellence, ownership, user trust';
  const productsSummary = Array.isArray(companyBrief.products) ? companyBrief.products.join(', ') : 'Core platform';
  const reqSummary = requirements.map(r => `ID: "${r.id}" | Kind: ${r.kind} | Skill: ${r.text}`).join('\n');

  const userPrompt = `TARGET COMPANY: ${companyBrief.overview || 'Tech Company'}
MISSION & VALUES: ${valuesSummary}
PRODUCTS: ${productsSummary}
CULTURE & INTERVIEW STYLE: ${companyBrief.interviewCulture || 'Rigorous technical and cultural assessment'}
ROLE: ${roleBreakdown.title || 'Engineer'}

REQUIREMENTS TO REFERENCE (targetRequirementIds MUST use these exact IDs):
${reqSummary}

Generate 2 company-specific fit and culture alignment interview questions that test genuine interest and value alignment.`;

  return await executeWithRetry(async (attempt) => {
    const temperature = attempt === 0 ? 0.4 : 0.2;
    const response = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature,
      responseFormat: 'json'
    });

    const parsed = parseLlmJson(response.content);
    return validateQuestions(parsed, validRequirementIds, 'Stage7_CompanyFitQuestions');
  }, {
    maxRetries: 2,
    baseDelayMs: 400
  });
}

export default {
  executeStage7GenerateCompanyFitQuestions
};
