import express from 'express';
import { fetchTransactionsAPI, enrichTransactionsAPI } from '../controllers/transactions/transactionsController';
import { fetchTokenStatsAPI } from '../controllers/tokens/tokens';
const router = express.Router();

router.get('/transactions', fetchTransactionsAPI);
router.post('/transactions/enrich', enrichTransactionsAPI);
router.get('/tokens/stats', fetchTokenStatsAPI);

export default router; 