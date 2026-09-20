import { parseLlmJson } from '../resilience/jsonParser.js';
import { executeWithRetry } from '../resilience/retryWithBackoff.js';
import { validateFlashcards } from '../resilience/schemaValidator.js';

const SYSTEM_PROMPT = `You are an expert cognitive learning designer and interview coach.
Your task is to generate high-yield, bite-sized Revision Flashcards for rapid pre-interview memorization and concept verification.

CRITICAL RULES:
1. EVERY flashcard MUST target an explicit requirement from the provided list ("targetRequirementId").
2. Each flashcard must include:
   - "id": Stable identifier (e.g. "fc-1")
   - "targetRequirementId": Exact requirement ID from the list
   - "category": Short category tag (e.g. "DISTRIBUTED_SYSTEMS", "CONCURRENCY", "CULTURE", "LEADERSHIP")
   - "frontPrompt": Concise question or concept prompt for recall
   - "backKeyPoints": Array of 2-3 essential takeaway bullet points
   - "quickTip": Single practical interview tip or golden mnemonic

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "flashcards": [
    {
      "id": "fc-1",
      "targetRequirementId": "req-tech-1",
      "category": "CONCURRENCY",
      "frontPrompt": "How does Node.js event loop handle asynchronous I/O without blocking?",
      "backKeyPoints": [
        "Single main thread executes JS call stack and event loop ticks.",
        "Non-blocking network I/O delegated to OS kernel via epoll/kqueue.",
        "File I/O and crypto offloaded to libuv thread pool."
      ],
      "quickTip": "State libuv thread pool default of 4 threads to demonstrate deep runtime awareness."
    }
  ]
}`;

export async function executeStage8GenerateFlashcards(provider, { requirements = [], technicalQuestions = [], companyBrief = {} }) {
  const validRequirementIds = requirements.map(r => r.id);
  const reqSummary = requirements.map(r => `ID: "${r.id}" | Kind: ${r.kind} | Skill: ${r.text}`).join('\n');

  const topicContext = technicalQuestions.length > 0
    ? `\n\nKEY TECHNICAL TOPICS TO REINFORCE:\n${technicalQuestions.slice(0, 3).map(q => `- ${q.question}`).join('\n')}`
    : '';

  const userPrompt = `TARGET REQUIREMENTS TO COVER (targetRequirementId MUST match one of these):
${reqSummary}

TECH STACK / TOPICS:
${(companyBrief.techStack || []).join(', ') || 'Core backend technologies'}${topicContext}

Generate 4 to 6 high-yield flashcards covering key technical mechanics, architectural trade-offs, and behavioral tips.`;

  return await executeWithRetry(async (attempt) => {
    const temperature = attempt === 0 ? 0.3 : 0.1;
    const response = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature,
      responseFormat: 'json'
    });

    const parsed = parseLlmJson(response.content);
    return validateFlashcards(parsed, validRequirementIds);
  }, {
    maxRetries: 2,
    baseDelayMs: 400
  });
}

export default {
  executeStage8GenerateFlashcards
};
