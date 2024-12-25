import express from 'express';
import { fetchTransactionsAPI, enrichTransactionsAPI } from '../controllers/transactions/transactionsController';
import { fetchTokenStatsAPI, fetchTokenOHLCVAPI } from '../controllers/tokens/tokens';
import { generateApiKeyForUser, addCreditsToUser, verifyApiKey } from '../controllers/users';
import { fetchWalletStatsAPI } from '../controllers/wallets/wallets';

const router = express.Router();

router.post('/users/generate-key', generateApiKeyForUser);
router.post('/users/add-credits', addCreditsToUser);

router.use(verifyApiKey);

router.get('/transactions', fetchTransactionsAPI);
router.post('/transactions/enrich', enrichTransactionsAPI);
router.get('/tokens/stats', fetchTokenStatsAPI);
router.get('/tokens/ohlcv', fetchTokenOHLCVAPI);
router.get('/wallets/stats', fetchWalletStatsAPI);

export default router; 