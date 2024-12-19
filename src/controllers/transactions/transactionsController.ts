import { Request, Response } from 'express';
import { fetchTransactions, enrichTransactionsWithAddresses, fetchTransactionsByAddresses, fetchTransactionsByToken, fetchTransactionsByTokensAndAddresses } from './logic';
import { validateTimestamps, validatePeriod, validateDexes, validateAddresses, validateTokens } from '../../utils/validators';

export async function fetchTransactionsAPI(req: Request, res: Response) {
    try {
        const {
            startTimestamp,
            endTimestamp,
            period='5m',
            dexes=['raydium', 'pump', 'jupiter'],
            enrich = false,
            addresses,
            tokens
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

        if (!validateDexes(dexes as string[])) {
            return res.status(400).json({ error: 'Invalid dex values' });
        }

        const dexMappings = {
            raydium: 0,
            pump: 1,
            jupiter: 2,
        }

        const options = {
            startTimestamp: startTimestamp ? Number(startTimestamp) : undefined,
            endTimestamp: endTimestamp ? Number(endTimestamp) : undefined,
            period: period as string,
            dexKeys: dexes ? (dexes as string).split(',').map(dex => dexMappings[dex as keyof typeof dexMappings]) : [0,1,2]
        };

        let data: any[] = [];
        const BATCH_SIZE = 100;

        // Handle different query combinations
        if (addresses && tokens) {
            if (!validateAddresses(addresses as string[]) || !validateTokens(tokens as string[])) {
                return res.status(400).json({ error: 'Invalid addresses or tokens format' });
            }

            const addressArray = (addresses as string).split(',');
            const tokenArray = (tokens as string).split(',');

            // Process in batches
            for (let i = 0; i < addressArray.length; i += BATCH_SIZE) {
                const addressBatch = addressArray.slice(i, i + BATCH_SIZE);
                for (let j = 0; j < tokenArray.length; j += BATCH_SIZE) {
                    const tokenBatch = tokenArray.slice(j, j + BATCH_SIZE);
                    const batchData = await fetchTransactionsByTokensAndAddresses({
                        ...options,
                        addresses: addressBatch,
                        tokens: tokenBatch
                    });
                    data = data.concat(batchData);
                }
            }
        } else if (addresses) {
            if (!validateAddresses(addresses as string[])) {
                return res.status(400).json({ error: 'Invalid addresses format' });
            }

            const addressArray = (addresses as string).split(',');
            
            // Process addresses in batches
            for (let i = 0; i < addressArray.length; i += BATCH_SIZE) {
                const addressBatch = addressArray.slice(i, i + BATCH_SIZE);
                const batchData = await fetchTransactionsByAddresses({
                    ...options,
                    addresses: addressBatch
                });
                data = data.concat(batchData);
            }
        } else if (tokens) {
            if (!validateTokens(tokens as string[])) {
                return res.status(400).json({ error: 'Invalid tokens format' });
            }

            const tokenArray = (tokens as string).split(',');

            // Process tokens in batches
            for (let i = 0; i < tokenArray.length; i += BATCH_SIZE) {
                const tokenBatch = tokenArray.slice(i, i + BATCH_SIZE);
                const batchData = await fetchTransactionsByToken({
                    ...options,
                    tokenAddresses: tokenBatch
                });
                data = data.concat(batchData);
            }
        } else {
            data = await fetchTransactions(options);
        }

        const user = (req as any).user;
        const creditCost = 0; // Set credit cost to 0

        if (!user) {
            return res.status(403).json({ error: 'API key required' });
        }

        if (!user || user.creditBalance < creditCost) {
            return res.status(403).json({ error: 'Insufficient credits' });
        }

        user.creditBalance -= creditCost;
        await user.save();

        if (enrich === 'true') {
            const enrichedData = await enrichTransactionsWithAddresses(data);
            return res.json({
                success: true,
                data: enrichedData,
                creditCost,
                remainingCredits: user.creditBalance
            });
        } else {
            return res.json({
                success: true,
                data,
                creditCost,
                remainingCredits: user.creditBalance
            });
        }

    } catch (error: any) {
        console.error('Error in fetchTransactionsAPI:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export async function enrichTransactionsAPI(req: Request, res: Response) {
    try {
        const data = req.body;
        
        if (!Array.isArray(data)) {
            return res.status(400).json({
                success: false,
                error: 'Input data must be an array'
            });
        }

        // Validate array size
        if (data.length > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Input array exceeds maximum size of 1000 items'
            });
        }

        // Validate array contents
        for (const item of data) {
            if (!item.addressRef || !item.tokenInRef || !item.tokenOutRef) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid transaction data format'
                });
            }
        }

        const user = (req as any).user;
        const creditCost = 0; // Set credit cost to 0

        if (!user) {
            return res.status(403).json({ error: 'API key required' });
        }

        if (!user || user.creditBalance < creditCost) {
            return res.status(403).json({ error: 'Insufficient credits' });
        }

        user.creditBalance -= creditCost;
        await user.save();

        const enrichedData = await enrichTransactionsWithAddresses(data);
        return res.json({
            success: true,
            data: enrichedData,
            creditCost,
            remainingCredits: user.creditBalance
        });
    } catch (error: any) {
        console.error('Error in enrichTransactionsAPI:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
