
import { clickhouse } from '../../external/clickhouse';
import { Tokens, Wallets } from '../../models/models';
import { Op } from 'sequelize';

export async function enrichTransactions(data: any) {
    const uniqueAddresses = [...new Set(data.map((txn: any) => Number(txn.addressRef)))];
    const uniqueTokens = [...new Set(data.map((txn: any) => Number(txn.tokenInRef)).concat(data.map((txn: any) => Number(txn.tokenOutRef))))];
    
    const addresses = await Wallets.findAll({ where: { id: { [Op.in]: uniqueAddresses } } });
    const tokens = await Tokens.findAll({ where: { id: { [Op.in]: uniqueTokens } } });

    const addressMap = new Map(addresses.map(addr => [Number(addr.id), addr]));
    const tokenMap = new Map(tokens.map(token => [Number(token.id), token]));

    data.forEach((txn: any) => {
        txn.address = addressMap.get(Number(txn.addressRef));
        txn.tokenIn = tokenMap.get(Number(txn.tokenInRef));
        txn.tokenOut = tokenMap.get(Number(txn.tokenOutRef));
    });

    return data;
}

export async function fetchTransactions(opts: {
    startTimestamp?: number;
    endTimestamp?: number;
    period?: string;
    dexKeys?: number[];
}) {
  // Parse and validate inputs
  let parsedStartTimestamp = opts.startTimestamp ? opts.startTimestamp : null;
  let parsedEndTimestamp = opts.endTimestamp ? opts.endTimestamp : null;
  const parsedDexKeys = opts.dexKeys ? (Array.isArray(opts.dexKeys) ? opts.dexKeys : [opts.dexKeys]) : [1];

  // Calculate timestamps based on the period, if provided
  if (opts.period && (!parsedStartTimestamp || !parsedEndTimestamp)) {
    parsedEndTimestamp = Math.floor(Date.now() / 1000);

    // Parse period (e.g., '1s' for seconds, '1m' for minutes)
    const match = (opts.period as string).match(/(\d+)([smhdw])/);
    if (!match) {
      throw new Error("Invalid period format. Use '1s', '1m', '1h', '1d', or '1w'.");
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    // Calculate start timestamp based on the unit
    const unitToSeconds: { [key: string]: number } = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400,
      'w': 604800
    };

    const multiplier = unitToSeconds[unit];
    if (!multiplier) {
      throw new Error("Unsupported period unit. Use 's', 'm', 'h', 'd', or 'w'.");
    }

    parsedStartTimestamp = parsedEndTimestamp - (value * multiplier);
  }

  // Ensure both timestamps are set
  if (!parsedStartTimestamp || !parsedEndTimestamp) {
    throw new Error("Either timestamps or a valid period must be specified.");
  }

  const swapsQuery = `
      SELECT 
          swapTime,
          swapValueUSD,
          swapAmountIn, 
          swapAmountOut,
          tokenInRef,
          tokenOutRef,
          addressRef,
          dexKey
      FROM swaps
      WHERE swapTime BETWEEN ${parsedStartTimestamp} AND ${parsedEndTimestamp}
      AND dexKey IN (${parsedDexKeys.join(',')});`;
  
  const swapsResult = await clickhouse.query({
    query: swapsQuery,
    format: 'JSONEachRow'
  });

  return await swapsResult.json();
}