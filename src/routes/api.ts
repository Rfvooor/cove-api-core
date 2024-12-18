import express from 'express';
import { fetchTransactionsAPI, enrichTransactionsAPI } from '../controllers/transactions/transactionsController';
import { fetchTokenStatsAPI } from '../controllers/tokens/tokens';
import { generateApiKeyForUser, addCreditsToUser, verifyApiKey } from '../controllers/users';
import { rateLimiter } from '../middleware/rateLimiter';

const router = express.Router();

router.post('/users/generate-key', generateApiKeyForUser);
router.post('/users/add-credits', addCreditsToUser);

router.use(verifyApiKey);

router.get('/transactions', rateLimiter('transactions'), fetchTransactionsAPI);
router.post('/transactions/enrich', rateLimiter('transactionsEnrich'), enrichTransactionsAPI);
router.get('/tokens/stats', rateLimiter('tokensStats'), fetchTokenStatsAPI);

export default router; 