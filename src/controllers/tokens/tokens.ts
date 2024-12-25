import { Request, Response } from 'express';
import { fetchTokenStats, fetchTokenOHLCV } from './logic';
import { validatePeriod, validateTimestamps, validateDexes, validateTokens } from '../../utils/validators';

export async function fetchTokenStatsAPI(req: Request, res: Response) {
    try {
        const {
            period = '5m',
            minMarketCap,
            maxMarketCap,
            minNetFlow,
            maxNetFlow,
            minPriceChange,
            maxPriceChange,
            minTxCount,
            maxTxCount,
            minUniqueMakers,
            maxUniqueMakers,
            startTimestamp,
            endTimestamp,
            limit,
            sortBy,
            sortOrder,
            dexes='raydium,pump,jupiter',
            tokenAddresses,
            tokenRefs
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

        if (tokenAddresses && !validateTokens(tokenAddresses as string[])) {
            return res.status(400).json({ error: 'Invalid token addresses format' });
        }

        if (sortBy && !['volume', 'netFlow', 'txCount', 'uniqueMakers', 'priceChange'].includes(sortBy as string)) {
            return res.status(400).json({ error: 'Invalid sortBy value' });
        }
        const options = {
            period: period as string,
            minMarketCap: minMarketCap ? Number(minMarketCap) : undefined,
            maxMarketCap: maxMarketCap ? Number(maxMarketCap) : undefined,
            minNetFlow: minNetFlow ? Number(minNetFlow) : undefined,
            maxNetFlow: maxNetFlow ? Number(maxNetFlow) : undefined,
            minPriceChange: minPriceChange ? Number(minPriceChange) : undefined,
            maxPriceChange: maxPriceChange ? Number(maxPriceChange) : undefined,
            minTxCount: minTxCount ? Number(minTxCount) : undefined,
            maxTxCount: maxTxCount ? Number(maxTxCount) : undefined,
            minUniqueMakers: minUniqueMakers ? Number(minUniqueMakers) : undefined,
            maxUniqueMakers: maxUniqueMakers ? Number(maxUniqueMakers) : undefined,
            startTimestamp: startTimestamp ? Number(startTimestamp) : undefined,
            endTimestamp: endTimestamp ? Number(endTimestamp) : undefined,
            limit: limit ? Number(limit) : undefined,
            sortBy: sortBy as 'netFlow' | 'volume' | 'txCount' | 'uniqueMakers' | 'priceChange',
            sortOrder: sortOrder as 'asc' | 'desc',
            dexes: dexes ? (dexes as string).split(',') : ['raydium', 'pump', 'jupiter'],
            tokenAddresses: tokenAddresses ? (tokenAddresses as string).split(',') : undefined,
            tokenRefs: tokenRefs ? (tokenRefs as string).split(',').map(Number) : undefined
        };

        const user = (req as any).user;
        const stats = await fetchTokenStats(options);
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
        console.error('Error in fetchTokenStatsAPI:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
}

export async function fetchTokenOHLCVAPI(req: Request, res: Response) {
    try {
        const {
            tokenAddress,
            timeFrom,
            timeTo,
            period = '15m'
        } = req.query;

        if (!tokenAddress) {
            return res.status(400).json({ error: 'Token address is required' });
        }

        if (!timeFrom || !validateTimestamps(timeFrom as string)) {
            return res.status(400).json({ error: 'Invalid timeFrom timestamp' });
        }

        if (!timeTo || !validateTimestamps(timeTo as string)) {
            return res.status(400).json({ error: 'Invalid timeTo timestamp' });
        }

        if (!validatePeriod(period as string)) {
            return res.status(400).json({ error: 'Invalid period format' });
        }

        const user = (req as any).user;
        const creditCost = 0;

        if (!user || user.creditBalance < creditCost) {
            return res.status(403).json({ error: 'Insufficient credits' });
        }

        const data = await fetchTokenOHLCV(
            tokenAddress as string,
            Number(timeFrom),
            Number(timeTo),
            period as string
        );

        user.creditBalance -= creditCost;
        await user.save();

        return res.status(200).json({
            ...data,
            creditCost,
            remainingCredits: user.creditBalance,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in fetchTokenOHLCVAPI:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
}