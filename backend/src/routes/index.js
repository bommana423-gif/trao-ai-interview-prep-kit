import { Router } from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.js';
import kitRoutes from './kits.js';
import researchRoutes from './research.js';

const router = Router();

// Mount module routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/kits', kitRoutes);
router.use('/research', researchRoutes);

export default router;
