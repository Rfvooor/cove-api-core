import moment from 'moment';
import * as math from 'mathjs';
import { Tokens } from '../ingress/database/mysql/models';
import crypto from 'crypto';

function formatToDecimalPlaces(num: number, decimalPlaces: number): string {
    return Number(num).toFixed(decimalPlaces);
}

/**
 * Checks if a value is within a specified range with optional debug logging.
 * @param {number} value - Value to check.
 * @param {number} minValue - Minimum acceptable value.
 * @param {number} maxValue - Maximum acceptable value.
 * @param {boolean} [debug=false] - Whether to log debug information.
 * @returns {boolean} - Whether the value is within range.
 */
function isWithinRange(value: number | string, minValue: number, maxValue: number, debug: boolean = false): boolean {
    const numVal = typeof value === 'string' ? parseFloat(value) : value;

    if (debug) {
        console.log(`Checking value: ${numVal} against range [${minValue}, ${maxValue}]`);
    }

    const result = minValue <= numVal && numVal <= maxValue;

    if (debug) {
        console.log(`Result: ${result}`);
    }

    return result;
}

const retryAsync = async <T>(fn: () => Promise<T>, retries: number = 6, delay: number = 200): Promise<T> => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) {
                console.error(`Retry attempt ${i + 1} failed.`, error);
                throw error; // If it's the last attempt, rethrow the error
            }
            //console.log(error)
            // Optionally log the error and delay before retrying
            await new Promise(res => setTimeout(res, delay));
        }
    }
    throw new Error('Retry failed'); // TypeScript requires this
};

interface Transaction {
    swapTime: string;
    swapValueUSD: number;
    swapAmountIn: number;
    swapAmountOut: number;
    tokenInRef: string;
    tokenOutRef: string;
}

/**
 * Splits transaction logs into volume bars based on a time frame.
 * @param {Transaction[]} transactionLog - List of transaction objects.
 * @param {number} timeFrame - Duration of each bar in seconds.
 * @param {number} lookback - Number of bars to look back.
 * @param {string} token - Token to analyze.
 * @returns {number[]} - Array of volume changes for each bar.
 */
function splitIntoBars(transactionLog: Transaction[], timeFrame: number, lookback: number, token: string): number[] {
    const now = moment();
    const totalPeriod = timeFrame * lookback;
    const startTime = now.clone().subtract(totalPeriod, 'seconds');
    const bars = Array(lookback).fill(0);

    function getBarIndex(timestamp: string): number {
        // Ensure timestamp is parsed correctly
        const time = moment(timestamp); // Changed from moment.unix(timestamp)
        const secondsFromStart = time.diff(startTime, 'seconds');
        if (secondsFromStart < 0 || time.isAfter(now)) return -1;
        return Math.floor(secondsFromStart / timeFrame);
    }

    transactionLog.forEach(tx => {
        const barIndex = getBarIndex(tx.swapTime);
        if (barIndex >= 0 && barIndex < lookback) {
            const volumeChange = parseFloat(tx.swapValueUSD.toString());
            bars[barIndex] += (tx.tokenOutRef === token) ? volumeChange : (tx.tokenInRef === token) ? -volumeChange : 0;
        }
    });
    return bars;
}


interface PumpInfo {
    symbol?: string;
    marketCap?: number;
    complete?: boolean;
    usd_market_cap?: number;
}

interface CacheEntry {
    timestamp: number;
    data: PumpInfo;
}

// Cache for pump info responses
const pumpInfoCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10000; // 10 seconds in milliseconds

async function getPumpInfo(address: string): Promise<PumpInfo> {
    const now = Date.now();
    const cached = pumpInfoCache.get(address);
    
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }

    let data: PumpInfo;
    try {
        data = await retryAsync(async () => {
            const response = await fetch(`https://frontend-api.pump.fun/coins/${address}`);
            const data = await response.json();
            return {
                symbol: data.symbol,
                marketCap: data.usd_market_cap,
                complete: data.complete
            };
        }, 2, 500);
    } catch (error) {
        // If API request fails, try to get data from database
        const token = await Tokens.findOne({
            where: { address },
            attributes: ['tokenSymbol', 'bonded'],
            raw: true
        });

        data = {
            symbol: token?.tokenSymbol,
            complete: token?.bonded,
            marketCap: 0
        };
    }

    // Update token info in database if we got new data
    if (data.symbol || data.complete !== undefined) {
        await Tokens.update({
            tokenSymbol: data.symbol?.replace(/[^a-zA-Z0-9]/g, ''), // Remove special chars
            bonded: data.complete
        }, {
            where: { address }
        });
    }

    pumpInfoCache.set(address, {
        timestamp: now,
        data: data
    });

    return data;
}

/**
 * Parse the period string and return the start timestamp.
 * @param {string} period - Period in the format '2m', '3m', '5m', '1h', '1d', or '1w'.
 * @returns {number} - Start timestamp (seconds)
 */
function parsePeriod(period: string): number {
    const now = Math.floor(Date.now() / 1000);
    const periodMatch = period.match(/(\d+)([smhdw])/);
    if (periodMatch) {
        const duration = parseInt(periodMatch[1]);
        const unit = periodMatch[2];
        switch (unit) {
            case 's':
                return now - duration;
            case 'm':
                return now - duration * 60;
            case 'h':
                return now - duration * 60 * 60;
            case 'd':
                return now - duration * 24 * 60 * 60;
            case 'w':
                return now - duration * 7 * 24 * 60 * 60;
            default:
                throw new Error('Invalid period format. Use "2m", "3m", "5m", "1h", "1d", or "1w".');
        }
    } else {
        throw new Error('Invalid period format. Use "2m", "3m", "5m", "1h", "1d", or "1w".');
    }
}

/**
 * Calculate kurtosis for a given array of numbers.
 * @param {number[]} data - Array of numbers.
 * @returns {number} - Kurtosis value.
 */
function calculateKurtosis(data: number[]): number {
    const n = data.length;
    const mean = math.mean(data);
    const variance = math.variance(data);
    const numerator = data.reduce((acc, val) => acc + Math.pow(val - mean, 4), 0);
    return (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * (numerator / Math.pow(variance, 2)) - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3));
}

/**
 * Calculate skewness for a given array of numbers.
 * @param {number[]} data - Array of numbers.
 * @returns {number} - Skewness value.
 */
function calculateSkewness(data: number[]): number {
    const n = data.length;
    const mean = math.mean(data);
    const variance = math.variance(data);
    const numerator = data.reduce((acc, val) => acc + Math.pow(val - mean, 3), 0);
    return (n / ((n - 1) * (n - 2))) * (numerator / Math.pow(variance, 1.5));
}


/**
 * Determines the type of distribution based on skewness and kurtosis.
 * @param {number} skewness - The skewness value.
 * @param {number} kurtosis - The kurtosis value.
 * @returns {string} - The type of distribution.
 */
function getDistributionType(skewness: number, kurtosis: number): string {
    if (Math.abs(skewness) > 1) {
        if (kurtosis > 3) {
            return 'Right-skewed leptokurtic';
        } else if (kurtosis < 3) {
            return 'Right-skewed platykurtic';
        } else {
            return 'Right-skewed mesokurtic';
        }
    } else if (Math.abs(skewness) < 1) {
        if (kurtosis > 3) {
            return 'Left-skewed leptokurtic';
        } else if (kurtosis < 3) {
            return 'Left-skewed platykurtic';
        } else {
            return 'Left-skewed mesokurtic';
        }
    } else {
        if (kurtosis > 3) {
            return 'Leptokurtic';
        } else if (kurtosis < 3) {
            return 'Platykurtic';
        } else {
            return 'Mesokurtic';
        }
    }
}

/**
 * Calculates the confidence range for a given set of statistics and confidence level.
 * @param {number} avg - The average value.
 * @param {number} std - The standard deviation.
 * @param {number} med - The median value.
 * @param {string} distributionType - The type of distribution.
 * @param {number} confidenceLevel - The desired confidence level (e.g., 0.95 for 95%).
 * @returns {[number, number]} - The confidence range [lowerBound, upperBound].
 */
function getConfidenceRange(
    avg: number, 
    std: number, 
    med: number, 
    distributionType: string, 
    confidenceLevel: number = 0.95
): [number, number] {
    if (std === 0) {
        throw new Error('Standard deviation cannot be zero.');
    }

    const factor = getConfidenceFactor(distributionType, confidenceLevel);

    if (distributionType.includes('right-skewed') || distributionType.includes('left-skewed')) {
        return [med - factor * std, med + factor * std];
    } else {
        return [avg - factor * std, avg + factor * std];
    }
}

/**
 * Determines the confidence factor based on the distribution type and confidence level.
 * @param {string} distributionType - The type of distribution.
 * @param {number} confidenceLevel - The desired confidence level (e.g., 0.95 for 95%).
 * @returns {number} - The confidence factor.
 */
function getConfidenceFactor(distributionType: string, confidenceLevel: number): number {
    const confidenceFactors: { [key: string]: { [key: string]: number } } = {
        'Right-skewed leptokurtic': {
            '0.95': 2.33,
            '0.99': 3.09,
            '0.999': 3.72,
        },
        'Right-skewed platykurtic': {
            '0.95': 2.14,
            '0.99': 2.81,
            '0.999': 3.37,
        },
        'Right-skewed mesokurtic': {
            '0.95': 2.26,
            '0.99': 2.92,
            '0.999': 3.49,
        },
        'Left-skewed leptokurtic': {
            '0.95': 2.33,
            '0.99': 3.09,
            '0.999': 3.72,
        },
        'Left-skewed platykurtic': {
            '0.95': 2.14,
            '0.99': 2.81,
            '0.999': 3.37,
        },
        'Left-skewed mesokurtic': {
            '0.95': 2.26,
            '0.99': 2.92,
            '0.999': 3.49,
        },
        'Leptokurtic': {
            '0.95': 2.33,
            '0.99': 3.09,
            '0.999': 3.72,
        },
        'Platykurtic': {
            '0.95': 2.14,
            '0.99': 2.81,
            '0.999': 3.37,
        },
        'Mesokurtic': {
            '0.95': 2.26,
            '0.99': 2.92,
            '0.999': 3.49,
        },
    };
    return confidenceFactors[distributionType][confidenceLevel.toString()];
}

/**
 * Calculates the entropy of a given set of values.
 * @param {number[]} values - The array of values to calculate entropy for.
 * @returns {number} - The calculated entropy.
 * @throws {Error} - If the values array is empty or contains non-numeric values.
 */
function calculateEntropy(values: number[]): number {
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Invalid input. The values array is either empty or not an array.');
    }
    if (values.some(value => typeof value !== 'number' || isNaN(value))) {
        throw new Error('Invalid input. The values array contains non-numeric values.');
    }
    const probabilities = values.map(value => value / values.reduce((a, b) => a + b, 0));
    return -probabilities.reduce((a, b) => a + b * Math.log2(b), 0);
}

interface CalculatedStats {
    avg: number;
    std: number;
    med: number;
    kurt: number;
    skew: number;
    sum: number;
    max: number;
    min: number;
    q1: number;
    q3: number;
    volatility: number;
    change: number;
    rateOfChange: number;
    cvValue: number;
    entropy: number;
}

/**
 * Calculates comprehensive statistics, including quartiles, change, rate of change, CV value, and entropy, for a given set of values.
 * @param {number[]} values - The array of values to analyze.
 * @returns {CalculatedStats} - An object containing the calculated statistics.
 */
function calculateStats(values: number[]): CalculatedStats {
    try {
        const sortedValues = values.sort((a, b) => a - b);
        const quartile1 = math.median(sortedValues.slice(0, Math.floor(sortedValues.length / 2)));
        const quartile3 = math.median(sortedValues.slice(Math.ceil(sortedValues.length / 2)));
        const mean = math.mean(values);
        const stdDev = math.std(values);
        const cvValue = stdDev / mean; // Coefficient of Variation (CV) value
        const entropy = calculateEntropy(values); // Assuming calculateEntropy is defined elsewhere
        const change = values[values.length - 1] - values[0]; // Change from first to last value
        const rateOfChange = change / values[0]; // Rate of change from first to last value
        return {
            avg: mean,
            std: stdDev,
            med: math.median(values),
            kurt: calculateKurtosis(values),
            skew: calculateSkewness(values),
            sum: values.reduce((accumulator, currentValue) => accumulator + currentValue, 0),
            max: Math.max(...values),
            min: Math.min(...values),
            q1: quartile1,
            q3: quartile3,
            volatility: calculateVolatility(values), // Added volatility calculation
            change: change,
            rateOfChange: rateOfChange,
            cvValue: cvValue,
            entropy: entropy
        };
    } catch (error) {
        return {
            avg: 0,
            std: 0, 
            med: 0,
            kurt: 0,
            skew: 0,
            sum: 0,
            max: 0,
            min: 0,
            q1: 0,
            q3: 0,
            volatility: 0, // Added volatility calculation
            change: 0,
            rateOfChange: 0,
            cvValue: 0,
            entropy: 0
        };
    }
}

/**
 * Calculates the volatility of a given set of values.
 * @param {number[]} values - The array of values to analyze.
 * @returns {number} - The volatility of the values.
 */
function calculateVolatility(values: number[]): number {
    const mean = math.mean(values);
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const variance = math.mean(squaredDiffs);
    return Math.sqrt(variance);
}

interface TokenInfo {
    address: string;
    price: number;
    supply: number;
    marketCap: number;
    bundlePct: number;
    lastUpdateTime: string;
}

interface TokenVolumes {
    [key: string]: {
        [key: number]: number;
    };
}

function processTokenVolume(
    address: string, 
    txn: Transaction, 
    intervalIndex: number, 
    isBuy: boolean, 
    supply: number,
    bundleAmt: number,
    tokenInfoMap: { [key: string]: TokenInfo }, 
    tokenIntervalVolumes: TokenVolumes, 
    tokenNetBuys: TokenVolumes,
    minMarketCap: number,
    maxMarketCap: number
): void {
    const price = txn.swapValueUSD / (isBuy ? txn.swapAmountOut : txn.swapAmountIn);
    const marketCap = price * supply;
    const bundlePct = (bundleAmt / supply) * 100;

    tokenInfoMap[address] = {
        address,
        price,
        supply,
        marketCap,
        bundlePct,
        lastUpdateTime: txn.swapTime
    };

    if (isWithinRange(marketCap, minMarketCap, maxMarketCap)) {
        if (!tokenIntervalVolumes[address]) {
            tokenIntervalVolumes[address] = {};
        }
        if (!tokenNetBuys[address]) {
            tokenNetBuys[address] = {};
        }
        tokenIntervalVolumes[address][intervalIndex] = 
            (tokenIntervalVolumes[address][intervalIndex] || 0) + txn.swapValueUSD;
        
        tokenNetBuys[address][intervalIndex] = 
            (tokenNetBuys[address][intervalIndex] || 0) + 
            (isBuy ? txn.swapValueUSD : -txn.swapValueUSD);
    }
}

function formatLargeNumber(num: number | undefined): string {
    if (!num) return '$0';
    if (num >= 1e9) return `$${(num/1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num/1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num/1e3).toFixed(1)}K`;
    return `$${num.toFixed(1)}`;
}

/**
 * Parse the interval string and return the interval duration in seconds.
 * @param {string} interval - Interval in the format '30s', '1m', '5m', '1h', etc.
 * @returns {number} - Interval duration in seconds
 */
function parseInterval(interval: string): number {
    const intervalMatch = interval.match(/(\d+)([smh])/);
    if (intervalMatch) {
        const duration = parseInt(intervalMatch[1]);
        const unit = intervalMatch[2];
        switch (unit) {
            case 's':
                return duration;
            case 'm':
                return duration * 60;
            case 'h':
                return duration * 60 * 60;
            default:
                throw new Error('Invalid interval format. Use "30s", "1m", "5m", "1h", etc.');
        }
    } else {
        throw new Error('Invalid interval format. Use "30s", "1m", "5m", "1h", etc.');
    }
}

function calculatePriceChange(initialPrice: number | null | undefined, currentPrice: number | null | undefined): number {
    // Handle cases where either price is null/undefined/0
    if (!initialPrice || !currentPrice) {
        return 0;
    }

    // Convert to numbers in case they're strings
    const initial = Number(initialPrice);
    const current = Number(currentPrice);

    // Avoid division by zero
    if (initial === 0) {
        return 0;
    }

    // Calculate percentage change: ((current - initial) / initial) * 100
    const percentageChange = ((current - initial) / initial) * 100;

    // Round to 2 decimal places
    return Math.round(percentageChange * 100) / 100;
};

export const generateApiKey = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export {
    isWithinRange,
    splitIntoBars,
    formatToDecimalPlaces,
    retryAsync,
    getPumpInfo,
    parsePeriod,
    getDistributionType,
    getConfidenceRange,
    calculateKurtosis,
    calculateSkewness,
    calculateStats,
    processTokenVolume,
    formatLargeNumber,
    parseInterval,
    calculatePriceChange,
};
