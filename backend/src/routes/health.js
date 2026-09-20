import { Router } from 'express';
import { getHealth, getPing } from '../controllers/healthController.js';

const router = Router();

// GET /api/v1/health - Comprehensive health & database status
router.get('/', getHealth);

// GET /api/v1/health/ping - Liveness probe
router.get('/ping', getPing);

export default router;
