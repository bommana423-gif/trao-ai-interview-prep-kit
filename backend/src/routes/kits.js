import { Router } from 'express';
import { 
  createKit, 
  getMyKits, 
  getKitById, 
  deleteKit, 
  generateKit,
  generateScheduleForKit,
  remediateKitCoverage,
  updateKit,
  addQuestionToKit,
  updateQuestionInKit,
  deleteQuestionFromKit,
  reorderQuestionsInModule,
  addFlashcardToKit,
  updateFlashcardInKit,
  deleteFlashcardFromKit,
  regenerateKitSection,
  getFlashcardPracticeSession,
  submitFlashcardReview,
  resetFlashcardPractice
} from '../controllers/kitController.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Protect ALL kit routes: user must be authenticated
router.use(requireAuth);

// Rate limiter for expensive AI generation pipeline operations (15/min)
const generationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Kit generation rate limit reached. Please wait a minute before requesting another AI generation.'
});

// Kit Generation & Lifecycle
router.post('/generate', generationLimiter, generateKit);
router.post('/', createKit);
router.get('/', getMyKits);
router.get('/:id', getKitById);
router.patch('/:id', updateKit);
router.delete('/:id', deleteKit);

// Schedule & Coverage Remediation
router.post('/:id/schedule', generateScheduleForKit);
router.post('/:id/remediate', remediateKitCoverage);

// Targeted Selective Regeneration
router.post('/:id/regenerate', generationLimiter, regenerateKitSection);

// Questions CRUD & Reorganization
router.post('/:id/questions', addQuestionToKit);
router.post('/:id/questions/reorder', reorderQuestionsInModule);
router.patch('/:id/questions/:questionId', updateQuestionInKit);
router.delete('/:id/questions/:questionId', deleteQuestionFromKit);

// Flashcards Practice Mode (Placed before :cardId to avoid route param collisions)
router.get('/:id/flashcards/practice', getFlashcardPracticeSession);
router.post('/:id/flashcards/reset-practice', resetFlashcardPractice);
router.post('/:id/flashcards/:cardId/review', submitFlashcardReview);

// Flashcards CRUD
router.post('/:id/flashcards', addFlashcardToKit);
router.patch('/:id/flashcards/:cardId', updateFlashcardInKit);
router.delete('/:id/flashcards/:cardId', deleteFlashcardFromKit);

export default router;
