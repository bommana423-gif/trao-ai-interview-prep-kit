import { Router } from 'express';
import { researchCompany } from '../controllers/researchController.js';

const router = Router();

// POST /api/v1/research/company
router.post('/company', researchCompany);

export default router;
