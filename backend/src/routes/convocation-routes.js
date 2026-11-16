import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { convocationSyncService } from '../services/convocation-sync-service.js';

export function createConvocationRouter() {
  const router = Router();

  router.get('/convocations', async (req, res) => {
    const status = z.enum(['matched', 'unmatched']).safeParse(req.query.status);
    res.json({ convocations: await convocationSyncService.list({
      status: status.success ? status.data : null,
    }) });
  });

  router.post('/convocations/sync', authenticate, authorize('admin', 'hr_specialist'), async (req, res) => {
    res.json(await convocationSyncService.sync());
  });

  return router;
}
