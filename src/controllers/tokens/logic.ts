import { clickhouse } from '../../external/clickhouse';
import { getTokenMappingByAddress, getTokenMappings, getTokenMappingsByAddresses } from '../../utils/databaseUtils';
import { parsePeriod } from '../../utils/utils';
import { chainstackConnection1 as connection } from '../../external/rpc';
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
                ${opts.dexKeys ? `AND dexKey IN (${opts.dexKeys.join(',')})` : ''}
                ${opts.tokenRefs ? `AND tokenInRef IN (${opts.tokenRefs.join(',')})` : ''}
            GROUP BY token
        ),
        first_prices AS (
            SELECT DISTINCT ON (token)
                token,
                firstPrice
            FROM (
                SELECT
                    tokenOutRef as token,
                    MIN(swapValueUSD/swapAmountOut) OVER (PARTITION BY tokenOutRef ORDER BY swapTime) as firstPrice
                FROM swaps
                WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
                UNION ALL
                SELECT 
                    tokenInRef as token,
                    MIN(swapValueUSD/swapAmountIn) OVER (PARTITION BY tokenInRef ORDER BY swapTime) as firstPrice
                FROM swaps
                WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
            ) prices
        ),
        last_prices AS (
            SELECT DISTINCT ON (token)
                token,
                lastPrice
            FROM (
                SELECT
                    tokenOutRef as token,
                    MAX(swapValueUSD/swapAmountOut) OVER (PARTITION BY tokenOutRef ORDER BY swapTime DESC) as lastPrice
                FROM swaps
                WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
                UNION ALL
                SELECT
                    tokenInRef as token,
                    MAX(swapValueUSD/swapAmountIn) OVER (PARTITION BY tokenInRef ORDER BY swapTime DESC) as lastPrice
                FROM swaps
                WHERE swapTime >= ${startTimestamp} AND swapTime <= ${endTimestamp}
            ) prices
        )
        SELECT
            COALESCE(buys.token, sells.token) AS token,
            COALESCE(buyFlow, 0) - COALESCE(sellFlow, 0) AS netFlow,
            COALESCE(buyFlow, 0) + COALESCE(sellFlow, 0) AS totalFlow,
            COALESCE(buyCount, 0) + COALESCE(sellCount, 0) AS txCount,
            COALESCE(uniqueBuyers, 0) + COALESCE(uniqueSellers, 0) AS uniqueMakers,
            ((last_prices.lastPrice - first_prices.firstPrice) / first_prices.firstPrice) * 100 as priceChange,
            last_prices.lastPrice as price
        FROM buys
        FULL OUTER JOIN sells ON buys.token = sells.token
        LEFT JOIN first_prices ON COALESCE(buys.token, sells.token) = first_prices.token
        LEFT JOIN last_prices ON COALESCE(buys.token, sells.token) = last_prices.token
        WHERE COALESCE(buys.token, sells.token) NOT IN (2, 16)
        ${opts.sortBy ? 
            opts.sortBy === 'volume' ? 
                `ORDER BY totalFlow ${opts.sortOrder || 'desc'}` :
                `ORDER BY ${opts.sortBy} ${opts.sortOrder || 'desc'}`
            : 'ORDER BY abs(netFlow) DESC'
        }
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
                const price = row.price;
                const tokenRef = Number(row.token);
                const tokenMapping = tokenMappings[tokenRef];
                if (!tokenMapping) {
                    throw new Error(`No token mapping found for token ref ${tokenRef}`);
                }
                let supply = tokenMapping.tokenSupply;
                if (!supply) {
                    const supplyResponse = await connection.getTokenSupply(new PublicKey(tokenMapping.address));
                    supply = supplyResponse.value.uiAmount ?? 1_000_000_000;
                }
                const marketCap = price * supply;

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
        });
}

interface OHLCVResponse {
    success: boolean;
    data: {
        items: {
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
            netFlow: number;
        }[];
    };
}

export async function fetchTokenOHLCV(
    tokenAddress: string, 
    timeFrom: number,
    timeTo: number,
    period: string = '15m'
): Promise<OHLCVResponse> {
    // Parse period into seconds
    const periodMatch = period.match(/(\d+)([smhd])/);
    if (!periodMatch) throw new Error('Invalid period format');
    
    const value = parseInt(periodMatch[1]);
    const unit = periodMatch[2];
    const unitToSeconds: { [key: string]: number } = {
        's': 1,
        'm': 60,
        'h': 3600,
        'd': 86400
    };
    const intervalSeconds = value * unitToSeconds[unit];

    const query = `
        WITH prices AS (
            SELECT 
                swapTime,
                if(tokenInRef = {tokenRef:UInt32}, 
                    swapValueUSD / swapAmountIn,
                    swapValueUSD / swapAmountOut
                ) as price,
                swapValueUSD as volume,
                if(tokenInRef = {tokenRef:UInt32}, 
                    -swapAmountIn,
                    swapAmountOut
                ) as flow
            FROM swaps
            WHERE (tokenInRef = {tokenRef:UInt32} OR tokenOutRef = {tokenRef:UInt32})
                AND swapTime >= fromUnixTimestamp({timeFrom:UInt32})
                AND swapTime <= fromUnixTimestamp({timeTo:UInt32})
        )
        SELECT 
            toUnixTimestamp(toStartOfInterval(swapTime, INTERVAL {interval:UInt32} second)) as timestamp,
            any(price) as open,
            max(price) as high,
            min(price) as low,
            anyLast(price) as close,
            sum(volume) as volume,
            sum(flow) as netFlow
        FROM prices
        GROUP BY timestamp
        ORDER BY timestamp ASC
    `;

    const rows = await (await clickhouse.query({
        query,
        query_params: {
            tokenRef: Number(tokenAddress),
            timeFrom,
            timeTo,
            interval: intervalSeconds
        }
    })).json();

    return {
        success: true,
        data: {
            items: Array.isArray(rows) ? rows.map(row => ({
                timestamp: parseInt(row.timestamp),
                open: parseFloat(row.open),
                high: parseFloat(row.high),
                low: parseFloat(row.low),
                close: parseFloat(row.close),
                volume: parseFloat(row.volume),
                netFlow: parseFloat(row.netFlow)
            })) : []
        }
    };
}
