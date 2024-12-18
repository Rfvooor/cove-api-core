import { Request, Response } from 'express';
import { fetchTokenStats } from './logic';

export async function fetchTokenStatsAPI(req: Request, res: Response) {
    try {
        const {
            period,
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
            dexes,
            tokenAddresses,
            tokenRefs
        } = req.query;

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
            dexes: dexes ? (dexes as string).split(',') : undefined,
            tokenAddresses: tokenAddresses ? (tokenAddresses as string).split(',') : undefined,
            tokenRefs: tokenRefs ? (tokenRefs as string).split(',').map(Number) : undefined
        };

        const stats = await fetchTokenStats(options);
        res.json(stats);
    } catch (error) {
        console.error('Error in fetchTokenStatsAPI:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}