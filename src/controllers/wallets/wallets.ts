import { Request, Response } from 'express';
import { fetchWalletStats } from './logic';
import { validatePeriod, validateTimestamps, validateDexes, validateAddresses, validateTokens } from '../../utils/validators';

export async function fetchWalletStatsAPI(req: Request, res: Response) {
    try {
        const {
            period = '5m',
            startTimestamp,
            endTimestamp,
            dexes='raydium,pump,jupiter',
            walletAddresses,
            walletRefs,
            tokenAddresses,
            tokenRefs,
            includeSwaps = true,
            includeTopTokens = true,
            sortBy,
            sortOrder = 'desc'
        } = req.query;
        // Validate inputs
        if (!validatePeriod(period as string)) {
            return res.status(400).json({ error: 'Invalid period format' });
        }

        if (startTimestamp && !validateTimestamps(startTimestamp as string)) {
            return res.status(400).json({ error: 'Invalid start timestamp' });
        }

        if (endTimestamp && !validateTimestamps(endTimestamp as string)) {
            return res.status(400).json({ error: 'Invalid end timestamp' });
        }

        if (dexes && !validateDexes(dexes as string)) {
            return res.status(400).json({ error: 'Invalid dex values' });
        }

        if (walletAddresses && !validateAddresses(walletAddresses as string[])) {
            return res.status(400).json({ error: 'Invalid wallet addresses format' });
        }

        if (tokenAddresses && !validateTokens(tokenAddresses as string[])) {
            return res.status(400).json({ error: 'Invalid token addresses format' });
        }

        if (sortBy && !['volume', 'pnl', 'txCount', 'tokensTraded', 'avgHoldTime', 'avgTradeSize'].includes(sortBy as string)) {
            return res.status(400).json({ error: 'Invalid sortBy value' });
        }

        const options = {
            period: period as string,
            startTimestamp: startTimestamp ? Number(startTimestamp) : undefined,
            endTimestamp: endTimestamp ? Number(endTimestamp) : undefined,
            dexes: dexes ? (dexes as string).split(',') : ['raydium', 'pump', 'jupiter'],
            walletAddresses: walletAddresses ? (walletAddresses as string).split(',') : undefined,
            walletRefs: walletRefs ? (walletRefs as string).split(',').map(Number) : undefined,
            tokenAddresses: tokenAddresses ? (tokenAddresses as string).split(',') : undefined,
            tokenRefs: tokenRefs ? (tokenRefs as string).split(',').map(Number) : undefined,
            includeSwaps: includeSwaps === 'true',
            includeTopTokens: includeTopTokens === 'true',
            sortBy: sortBy as 'volume' | 'pnl' | 'txCount' | 'tokensTraded' | 'avgHoldTime' | 'avgTradeSize' | undefined,
            sortOrder: sortOrder as 'asc' | 'desc' | undefined
        };

        const user = (req as any).user;
        const stats = await fetchWalletStats(options);
        const creditCost = 0;

        if (!user || user.creditBalance < creditCost) {
            return res.status(403).json({ error: 'Insufficient credits' });
        }

        user.creditBalance -= creditCost;
        await user.save();

        return res.status(200).json({
            success: true,
            data: stats,
            creditCost,
            remainingCredits: user.creditBalance,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in fetchWalletStatsAPI:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
}
