import { clickhouse } from '../../external/clickhouse';
import { getTokenMappings, getTokenMappingsByAddresses } from '../../utils/databaseUtils';
import { parsePeriod } from '../../utils/utils';
import { dediConnection } from '../../external/rpc';
import { PublicKey } from '@solana/web3.js';

interface FetchTokenStatsOpts {
    debug?: boolean;
    minMarketCap?: number;
    maxMarketCap?: number;
    minVolume?: number;
    maxVolume?: number;
    minNetFlow?: number;
    maxNetFlow?: number;
    minPriceChange?: number;
    maxPriceChange?: number;
    minTxCount?: number;
    maxTxCount?: number;
    minUniqueMakers?: number;
    maxUniqueMakers?: number;
    period?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    limit?: number;
    sortBy?: 'netFlow' | 'volume' | 'txCount' | 'uniqueMakers' | 'priceChange';
    sortOrder?: 'asc' | 'desc';
    dexes?: string[];
    dexKeys?: number[];
    tokenAddresses?: string[];
    tokenRefs?: number[];
}

interface TokenStats {
    address: string;
    netFlow: number;
    volume: number;
    txCount: number;
    uniqueMakers: number;
    price: number;
    marketCap: number;
    priceChange: number;
}

export async function fetchTokenStats(opts: FetchTokenStatsOpts = {debug: false}): Promise<TokenStats[]> {
    const defaultOpts: FetchTokenStatsOpts = {
        debug: false,
        minMarketCap: 0,
        maxMarketCap: Infinity,
        minVolume: 0,
        maxVolume: Infinity,
        minNetFlow: 0,
        maxNetFlow: Infinity,
        minPriceChange: -Infinity,
        maxPriceChange: Infinity,
        minTxCount: 0,
        maxTxCount: Infinity,
        minUniqueMakers: 0,
        maxUniqueMakers: Infinity,
        period: '5m',
        limit: 100,
        sortBy: 'netFlow',
        sortOrder: 'desc',
        dexes: ['raydium', 'jupiter', 'pump'],
        tokenAddresses: [],
        tokenRefs: [],
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
    if (opts.tokenAddresses && opts.tokenAddresses.length > 0) {
        const tokenMappings = await getTokenMappingsByAddresses(opts.tokenAddresses);
        const tokenRefs = Object.keys(tokenMappings).map(Number);
        opts.tokenRefs = tokenRefs;
    }
    const query = `
        WITH buys AS (
            SELECT 
                tokenOutRef AS token,
                sum(swapValueUSD) AS buyFlow,
                count(*) AS buyCount,
                count(DISTINCT addressRef) as uniqueBuyers
            FROM swaps 
            WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
                AND tokenInRef=1
                AND tokenOutRef!=1
                ${opts.dexKeys ? `AND dexKey IN (${opts.dexKeys.join(',')})` : ''}
                ${opts.tokenRefs ? `AND tokenOutRef IN (${opts.tokenRefs.join(',')})` : ''}
            GROUP BY token
        ),
        sells AS (
            SELECT 
                tokenInRef AS token,
                sum(swapValueUSD) AS sellFlow,
                count(*) AS sellCount,
                count(DISTINCT addressRef) as uniqueSellers
            FROM swaps
            WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
                AND tokenOutRef=1
                AND tokenInRef!=1
                ${opts.dexKeys ? `AND dexKey IN (${opts.dexKeys.join(',')})` : ''}
                ${opts.tokenRefs ? `AND tokenInRef IN (${opts.tokenRefs.join(',')})` : ''}
            GROUP BY token
        ),
        first_prices AS (
            SELECT
                token,
                firstPrice
            FROM (
                SELECT
                    tokenOutRef as token,
                    argMin(swapValueUSD/swapAmountOut, swapTime) as firstPrice,
                    'out' as type
                FROM swaps
                WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
                AND tokenOutRef!=1
                GROUP BY token
                UNION ALL
                SELECT 
                    tokenInRef as token,
                    argMin(swapValueUSD/swapAmountIn, swapTime) as firstPrice,
                    'in' as type
                FROM swaps
                WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
                AND tokenInRef!=1
                GROUP BY token
            )
            GROUP BY token
            HAVING argMin(type, firstPrice) = type
        ),
        last_prices AS (
            SELECT
                token,
                lastPrice
            FROM (
                SELECT
                    tokenOutRef as token,
                    argMax(swapValueUSD/swapAmountOut, swapTime) as lastPrice,
                    'out' as type
                FROM swaps
                WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
                AND tokenOutRef!=1
                GROUP BY token
                UNION ALL
                SELECT
                    tokenInRef as token,
                    argMax(swapValueUSD/swapAmountIn, swapTime) as lastPrice,
                    'in' as type
                FROM swaps
                WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
                AND tokenInRef!=1
                GROUP BY token
            )
            GROUP BY token
            HAVING argMax(type, lastPrice) = type
        )
        SELECT
            COALESCE(buys.token, sells.token) AS token,
            COALESCE(buyFlow, 0) - COALESCE(sellFlow, 0) AS netFlow,
            COALESCE(buyFlow, 0) + COALESCE(sellFlow, 0) AS totalFlow,
            COALESCE(buyCount, 0) + COALESCE(sellCount, 0) AS txCount,
            COALESCE(uniqueBuyers, 0) + COALESCE(uniqueSellers, 0) AS uniqueMakers,
            ((last_prices.lastPrice - first_prices.firstPrice) / first_prices.firstPrice) * 100 as priceChange
        FROM buys
        FULL OUTER JOIN sells ON buys.token = sells.token
        LEFT JOIN first_prices ON buys.token = first_prices.token
        LEFT JOIN last_prices ON buys.token = last_prices.token
        ORDER BY ${opts.sortBy ? `${opts.sortBy} ${opts.sortOrder || 'desc'}` : 'abs(COALESCE(buyFlow, 0) - COALESCE(sellFlow, 0)) DESC'}
        LIMIT ${opts.limit || 100}
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
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
                continue;
            }
            throw error;
        }
    }

    if (!result) {
        throw new Error('Query failed after all retries');
    }

    const rows = await result.json() as any[];
    const tokenRefs = rows.map(row => parseInt(row.token)).filter(ref => ref !== 0);
    if (opts.debug) console.log('tokenRefs:', tokenRefs);
    const tokenMappings = await getTokenMappings(tokenRefs);
    if (opts.debug) console.log('tokenMappings:', tokenMappings);

    const processedRows = await Promise.all(
        rows
            .filter(row => parseInt(row.token) !== 0)
            .map(async row => {
                const price = row.lastPrice;
                const tokenRef = Number(row.token);
                const tokenMapping = tokenMappings[tokenRef];
                if (!tokenMapping) {
                    throw new Error(`No token mapping found for token ref ${tokenRef}`);
                }
                const supply = await dediConnection.getTokenSupply(new PublicKey(tokenMapping.address));
                const marketCap = price * (supply.value.uiAmount ?? 1_000_000_000);

                return {
                    address: tokenMapping.address,
                    netFlow: parseFloat(row.netFlow),
                    volume: parseFloat(row.totalFlow),
                    txCount: parseInt(row.txCount),
                    uniqueMakers: parseInt(row.uniqueMakers),
                    price,
                    marketCap,
                    priceChange: parseFloat(row.priceChange) || 0,
                } as TokenStats;
            })
    );

    return processedRows
        .filter(token => {
            if (opts.minMarketCap && token.marketCap < opts.minMarketCap) return false;
            if (opts.maxMarketCap && token.marketCap > opts.maxMarketCap) return false;
            if (opts.minNetFlow && token.netFlow < opts.minNetFlow) return false;
            if (opts.maxNetFlow && token.netFlow > opts.maxNetFlow) return false;
            if (opts.minPriceChange && token.priceChange < opts.minPriceChange) return false;
            if (opts.maxPriceChange && token.priceChange > opts.maxPriceChange) return false;
            if (opts.minTxCount && token.txCount < opts.minTxCount) return false;
            if (opts.maxTxCount && token.txCount > opts.maxTxCount) return false;
            if (opts.minUniqueMakers && token.uniqueMakers < opts.minUniqueMakers) return false;
            if (opts.maxUniqueMakers && token.uniqueMakers > opts.maxUniqueMakers) return false;
            return true;
        })
        .sort((a, b) => {
            const aValue = a[opts.sortBy || 'volume'];
            const bValue = b[opts.sortBy || 'volume'];
            const multiplier = opts.sortOrder === 'asc' ? 1 : -1;
            
            return (aValue - bValue) * multiplier;
        });
}