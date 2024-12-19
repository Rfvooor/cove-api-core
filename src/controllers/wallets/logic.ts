import { clickhouse } from '../../external/clickhouse';
import { parsePeriod } from '../../utils/utils';
import { getTokenMappings } from '../../utils/databaseUtils';

interface FetchWalletStatsOpts {
    debug?: boolean;
    period?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    dexes?: string[];
    dexKeys?: number[];
    walletAddresses?: string[];
    walletRefs?: number[];
    tokenAddresses?: string[];
    tokenRefs?: number[];
    includeSwaps?: boolean;
    includeTopTokens?: boolean;
    sortBy?: 'volume' | 'pnl' | 'txCount' | 'tokensTraded' | 'avgHoldTime' | 'avgTradeSize';
    sortOrder?: 'asc' | 'desc';
}

interface WalletStats {
    address: string;
    volume: number;
    tokensTraded: number;
    avgHoldTime: number;
    avgTradeSize: number;
    pnl: number;
    txCount: number;
    topTokensByPnl?: {
        address: string;
        pnl: number;
    }[];
    swaps?: {
        timestamp: number;
        tokenIn: string;
        tokenOut: string;
        amountIn: number;
        amountOut: number;
        valueUSD: number;
        dex: string;
    }[];
}

export async function fetchWalletStats(opts: FetchWalletStatsOpts = {debug: false}): Promise<WalletStats[]> {
    const defaultOpts: FetchWalletStatsOpts = {
        debug: false,
        period: '5m',
        dexes: ['raydium', 'jupiter', 'pump'],
        includeSwaps: true,
        includeTopTokens: true,
        sortBy: 'volume',
        sortOrder: 'desc'
    };

    opts = { ...defaultOpts, ...opts };

    if (opts.dexes && opts.dexes.length > 0) {
        const dexMappings = {
            "raydium": 0,
            "pump": 1,
            "jupiter": 2,
        } as const;
        opts.dexKeys = opts.dexes.map(dex => dexMappings[dex as keyof typeof dexMappings]);
    }

    const startTimestamp = opts.startTimestamp || parsePeriod(opts.period || '5m');
    const endTimestamp = opts.endTimestamp || Math.floor(Date.now() / 1000);

    const query = `
        SELECT
            addressRef AS wallet,
            swapTime as timestamp,
            tokenInRef,
            tokenOutRef,
            swapAmountIn as amountIn,
            swapAmountOut as amountOut,
            swapValueUSD as valueUSD,
            dexKey
        FROM swaps 
        WHERE swapTime >= ${startTimestamp} 
        AND swapTime <= ${endTimestamp}
        ${opts.dexKeys ? `AND dexKey IN (${opts.dexKeys.join(',')})` : ''}
        ${opts.walletRefs ? `AND addressRef IN (${opts.walletRefs.join(',')})` : ''}
        ${opts.tokenRefs ? `AND (tokenInRef IN (${opts.tokenRefs.join(',')}) OR tokenOutRef IN (${opts.tokenRefs.join(',')}))` : ''}
        ORDER BY swapTime ASC
    `;

    if (opts.debug) console.log('Query:', query);
    
    let retries = 5;
    let result;
    while (retries > 0) {
        try {
            result = await clickhouse.query({
                query: query,
                format: 'JSONEachRow'
            });
            break;
        } catch (error) {
            if ((error instanceof Error && (error.message.includes('Timeout') || error.message.includes('socket hang up'))) && retries > 1) {
                retries--;
                if (opts.debug) console.log(`Query timed out, retrying... ${retries} attempts remaining`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            throw error;
        }
    }

    if (!result) {
        throw new Error('Query failed after all retries');
    }

    const rows = await result.json() as any[];

    // Get all unique token refs
    const tokenRefs = new Set<number>();
    rows.forEach(row => {
        tokenRefs.add(row.tokenInRef);
        tokenRefs.add(row.tokenOutRef);
    });
    
    // Get token mappings
    const tokenMappings = await getTokenMappings(Array.from(tokenRefs));

    // Group swaps by wallet
    const walletSwaps = new Map<string, any[]>();
    rows.forEach(row => {
        const swaps = walletSwaps.get(row.wallet) || [];
        swaps.push(row);
        walletSwaps.set(row.wallet, swaps);
    });

    // Process stats for each wallet
    let results = Array.from(walletSwaps.entries()).map(([wallet, swaps]) => {
        const tokenHoldTimes = new Map<number, {firstBuy: number, lastSell: number}>();
        const tokenPnl = new Map<number, number>();
        let totalVolume = 0;
        
        swaps.forEach(swap => {
            totalVolume += parseFloat(swap.valueUSD);
            
            // Track token hold times
            if (!tokenHoldTimes.has(swap.tokenOutRef)) {
                tokenHoldTimes.set(swap.tokenOutRef, {
                    firstBuy: swap.timestamp,
                    lastSell: swap.timestamp
                });
            } else {
                const times = tokenHoldTimes.get(swap.tokenOutRef)!;
                times.lastSell = swap.timestamp;
            }

            // Calculate PnL per token
            const currentPnl = tokenPnl.get(swap.tokenOutRef) || 0;
            tokenPnl.set(swap.tokenOutRef, currentPnl + (swap.valueUSD));
        });

        // Calculate average hold time
        const holdTimes = Array.from(tokenHoldTimes.values())
            .map(times => times.lastSell - times.firstBuy);
        const avgHoldTime = holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length;

        // Get top tokens by PnL
        const topTokensByPnl = opts.includeTopTokens ? Array.from(tokenPnl.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tokenRef, pnl]) => ({
                address: tokenMappings[tokenRef].address,
                pnl
            })) : undefined;

        const result: WalletStats = {
            address: wallet,
            volume: totalVolume,
            tokensTraded: tokenHoldTimes.size,
            avgHoldTime,
            avgTradeSize: totalVolume / swaps.length,
            pnl: Array.from(tokenPnl.values()).reduce((a, b) => a + b, 0),
            txCount: swaps.length,
        };

        if (opts.includeTopTokens) {
            result.topTokensByPnl = topTokensByPnl;
        }

        if (opts.includeSwaps) {
            result.swaps = swaps.map(swap => ({
                timestamp: swap.timestamp,
                tokenIn: tokenMappings[swap.tokenInRef].address,
                tokenOut: tokenMappings[swap.tokenOutRef].address,
                amountIn: parseFloat(swap.amountIn),
                amountOut: parseFloat(swap.amountOut),
                valueUSD: parseFloat(swap.valueUSD),
                dex: ['raydium', 'pump', 'jupiter'][swap.dexKey]
            }));
        }

        return result;
    });

    if (opts.sortBy) {
        results.sort((a, b) => opts.sortOrder === 'asc' ? a[opts.sortBy!] - b[opts.sortBy!] : b[opts.sortBy!] - a[opts.sortBy!]);
    }

    return results;
}
