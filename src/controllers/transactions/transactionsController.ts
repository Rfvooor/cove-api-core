import { Request, Response } from 'express';
import { fetchTransactions, enrichTransactions } from './logic';

export async function fetchTransactionsAPI(req: Request, res: Response) {
    try {
        const {
            startTimestamp,
            endTimestamp,
            period='5m',
            dexes=['raydium', 'pump', 'jupiter'],
            enrich = false
        } = req.query;

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

        const data = await fetchTransactions(options);

        if (enrich === 'true') {
            const enrichedData = await enrichTransactions(data);
            res.json(enrichedData);
        } else {
            res.json(data);
        }

    } catch (error) {
        console.error('Error in fetchTransactionsAPI:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function enrichTransactionsAPI(req: Request, res: Response) {
    try {
        const data = req.body;
        
        if (!Array.isArray(data)) {
            throw new Error('Input data must be an array');
        }

        const enrichedData = await enrichTransactions(data);
        res.json(enrichedData);
    } catch (error) {
        console.error('Error in enrichTransactionsAPI:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
