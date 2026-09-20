import { parseLlmJson } from '../resilience/jsonParser.js';
import { executeWithRetry } from '../resilience/retryWithBackoff.js';
import { validateRequirements } from '../resilience/schemaValidator.js';

const SYSTEM_PROMPT = `You are a precision technical recruiter and job specification analyzer.
Your task is to extract atomic requirements from the provided Job Description.

CRITICAL RULES:
1. DO NOT INVENT OR HALLUCINATE REQUIREMENTS. Only extract skills, qualifications, and competencies explicitly stated or strictly required in the job description.
2. If the Job Description is sparse, minimal, or lacks sufficient details (e.g., fewer than 3 concrete technical requirements or vague buzzwords), you MUST preserve that limitation honestly:
   - Set "isSparseJd": true
   - Populate "insufficientInfoNotes" explaining exactly what critical information is missing (e.g. missing seniority expectations, tech stack versions, engineering responsibilities).
3. If the Job Description is adequately detailed, set "isSparseJd": false and "insufficientInfoNotes": null.
4. Each requirement MUST have:
   - "id": Stable identifier format "req-<kind_prefix>-<number>" (e.g. "req-tech-1", "req-behav-1", "req-domain-1", "req-exp-1")
   - "text": Precise description of the required competency
   - "kind": Exactly one of ["technical", "behavioral", "domain", "experience", "education"]
   - "priority": Exactly one of ["must-have", "nice-to-have"]
   - "sourceSnippet": Direct verbatim quote or close paraphrase from the JD demonstrating where this requirement originated.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "requirements": [
    {
      "id": "req-tech-1",
      "text": "Deep proficiency in distributed backend systems with Node.js and Express",
      "kind": "technical",
      "priority": "must-have",
      "sourceSnippet": "Must have 5+ years building backend microservices with Node.js"
    }
  ],
  "isSparseJd": false,
  "insufficientInfoNotes": null
}`;

export async function executeStage1ExtractRequirements(provider, { jobDescriptionRaw, targetRole = '', targetCompany = '' }) {
  const userPrompt = `TARGET ROLE: ${targetRole || 'Software Engineer'}
TARGET COMPANY: ${targetCompany || 'Not Specified'}

JOB DESCRIPTION:
"""
${jobDescriptionRaw.trim()}
"""

Extract atomic requirements from this Job Description following the system rules. Ensure stable IDs, correct kinds, and honest sparsity assessment.`;

  return await executeWithRetry(async (attempt) => {
    const temperature = attempt === 0 ? 0.1 : 0.0; // deterministic extraction
    const response = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature,
      responseFormat: 'json'
    });

    const parsed = parseLlmJson(response.content);
    return validateRequirements(parsed);
  }, {
    maxRetries: 2,
    baseDelayMs: 400
  });
}

export default {
  executeStage1ExtractRequirements
};
