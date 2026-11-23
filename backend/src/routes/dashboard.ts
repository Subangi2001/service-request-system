import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { getDeveloperDashboard, getManagerDashboard } from '../services/dashboard';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

// GET /api/dashboard
// Managers receive organization-wide stats and developer workloads.
// Developers receive stats for their own assigned requests only.
dashboardRouter.get('/', requireRole('manager', 'developer'), async (req, res) => {
  const user = req.user!;

  if (user.role === 'manager') {
    const data = await getManagerDashboard(user);
    res.json(data);
    return;
  }

  const data = await getDeveloperDashboard(user);
  res.json(data);
});