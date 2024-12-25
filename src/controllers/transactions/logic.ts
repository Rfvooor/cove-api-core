
import { clickhouse } from '../../external/clickhouse';
import { Tokens, Wallets } from '../../models/models';
import { Op } from 'sequelize';

export async function enrichTransactionsWithAddresses(data: any) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return [];
    }

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
const defaultFields = ['swapTime', 'swapValueUSD', 'swapAmountIn', 'swapAmountOut', 'tokenInRef', 'tokenOutRef', 'addressRef', 'dexKey', 'txnHash', 'slot'];

export async function fetchTransactions(opts: {
    startTimestamp?: number;
    endTimestamp?: number;
    period?: string;
    dexKeys?: number[];
    fields?: string[];
}) {
  // Parse and validate inputs
  let parsedStartTimestamp = opts.startTimestamp ? opts.startTimestamp : null;
  let parsedEndTimestamp = opts.endTimestamp ? opts.endTimestamp : null;
  const parsedDexKeys = opts.dexKeys ? (Array.isArray(opts.dexKeys) ? opts.dexKeys : [opts.dexKeys]) : [1];
  const fields = opts.fields || defaultFields;

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
          ${fields.join(',')}
      FROM swaps
      WHERE swapTime BETWEEN ${parsedStartTimestamp} AND ${parsedEndTimestamp}
      AND dexKey IN (${parsedDexKeys.join(',')});`;
  
  try {
    const swapsResult = await clickhouse.query({
      query: swapsQuery,
      format: 'JSONEachRow'
    });

    return await swapsResult.json();
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}

export async function fetchTransactionsByAddresses(opts: {
    addresses: string[];
    startTimestamp?: number;
    endTimestamp?: number;
    period?: string;
    dexKeys?: number[];
    fields?: string[];
}) {
  if (!opts.addresses || !Array.isArray(opts.addresses) || opts.addresses.length === 0) {
    throw new Error("Addresses array is required and cannot be empty");
  }

  // Parse and validate inputs
  let parsedStartTimestamp = opts.startTimestamp ? opts.startTimestamp : null;
  let parsedEndTimestamp = opts.endTimestamp ? opts.endTimestamp : null;
  const parsedDexKeys = opts.dexKeys ? (Array.isArray(opts.dexKeys) ? opts.dexKeys : [opts.dexKeys]) : [1];
  const fields = opts.fields || defaultFields;

  // Get address refs
  const wallets = await Wallets.findAll({
    where: {
      address: {
        [Op.in]: opts.addresses
      }
    }
  });

  if (!wallets.length) {
    return [];
  }

  const addressRefs = wallets.map(w => w.id);

  // Calculate timestamps based on the period, if provided
  if (opts.period && (!parsedStartTimestamp || !parsedEndTimestamp)) {
    parsedEndTimestamp = Math.floor(Date.now() / 1000);

    const match = (opts.period as string).match(/(\d+)([smhdw])/);
    if (!match) {
      throw new Error("Invalid period format. Use '1s', '1m', '1h', '1d', or '1w'.");
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

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
          ${fields.join(',')}
      FROM swaps
      WHERE swapTime BETWEEN ${parsedStartTimestamp} AND ${parsedEndTimestamp}
      AND dexKey IN (${parsedDexKeys.join(',')})
      AND addressRef IN (${addressRefs.join(',')});`;
  
  try {
    const swapsResult = await clickhouse.query({
      query: swapsQuery,
      format: 'JSONEachRow'
    });

    return await swapsResult.json();
  } catch (error) {
    console.error('Error fetching transactions by addresses:', error);
    throw error;
  }
}

export async function fetchTransactionsByToken(opts: {
    tokenAddresses: string[];
    startTimestamp?: number;
    endTimestamp?: number;
    period?: string;
    dexKeys?: number[];
    fields?: string[];
}) {
  if (!opts.tokenAddresses || !Array.isArray(opts.tokenAddresses) || opts.tokenAddresses.length === 0) {
    throw new Error("Token addresses array is required and cannot be empty");
  }

  // Parse and validate inputs
  let parsedStartTimestamp = opts.startTimestamp ? opts.startTimestamp : null;
  let parsedEndTimestamp = opts.endTimestamp ? opts.endTimestamp : null;
  const parsedDexKeys = opts.dexKeys ? (Array.isArray(opts.dexKeys) ? opts.dexKeys : [opts.dexKeys]) : [1];
  const fields = opts.fields || defaultFields;

  // Get token ref
  const tokens = await Tokens.findAll({
    where: {
        address: {
        [Op.in]: opts.tokenAddresses
      }
    }
  });

  if (!tokens.length) {
    return [];
  }

  const tokenRefs = tokens.map(t => t.id);

  // Calculate timestamps based on the period, if provided
  if (opts.period && (!parsedStartTimestamp || !parsedEndTimestamp)) {
    parsedEndTimestamp = Math.floor(Date.now() / 1000);

    const match = (opts.period as string).match(/(\d+)([smhdw])/);
    if (!match) {
      throw new Error("Invalid period format. Use '1s', '1m', '1h', '1d', or '1w'.");
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

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
      SELECT DISTINCT
          ${fields.join(',')}
      FROM swaps
      WHERE swapTime BETWEEN ${parsedStartTimestamp} AND ${parsedEndTimestamp}
      AND dexKey IN (${parsedDexKeys.join(',')})
      AND (tokenInRef IN (${tokenRefs.join(',')}) OR tokenOutRef IN (${tokenRefs.join(',')}));`;
  
  try {
    const swapsResult = await clickhouse.query({
      query: swapsQuery,
      format: 'JSONEachRow'
    });

    return await swapsResult.json();
  } catch (error) {
    console.error('Error fetching transactions by token:', error);
    throw error;
  }
}

export async function fetchTransactionsByTokensAndAddresses(opts: {
    tokens: string[];
    addresses: string[];
    startTimestamp?: number;
    endTimestamp?: number;
    period?: string;
    dexKeys?: number[];
    fields?: string[];
}) {
  if (!opts.tokens || !Array.isArray(opts.tokens) || opts.tokens.length === 0) {
    throw new Error("Tokens array is required and cannot be empty");
  }

  if (!opts.addresses || !Array.isArray(opts.addresses) || opts.addresses.length === 0) {
    throw new Error("Addresses array is required and cannot be empty");
  }

  // Parse and validate inputs
  let parsedStartTimestamp = opts.startTimestamp ? opts.startTimestamp : null;
  let parsedEndTimestamp = opts.endTimestamp ? opts.endTimestamp : null;
  const parsedDexKeys = opts.dexKeys ? (Array.isArray(opts.dexKeys) ? opts.dexKeys : [opts.dexKeys]) : [1];
  const fields = opts.fields || defaultFields;

  // Get token and address refs
  const tokens = await Tokens.findAll({
    where: {
      address: {
        [Op.in]: opts.tokens
      }
    }
  });

  const wallets = await Wallets.findAll({
    where: {
      address: {
        [Op.in]: opts.addresses
      }
    }
  });

  if (!tokens.length || !wallets.length) {
    return [];
  }

  const tokenRefs = tokens.map(t => t.id);
  const addressRefs = wallets.map(w => w.id);

  // Calculate timestamps based on the period, if provided
  if (opts.period && (!parsedStartTimestamp || !parsedEndTimestamp)) {
    parsedEndTimestamp = Math.floor(Date.now() / 1000);

    const match = (opts.period as string).match(/(\d+)([smhdw])/);
    if (!match) {
      throw new Error("Invalid period format. Use '1s', '1m', '1h', '1d', or '1w'.");
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

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
          ${fields.join(',')}
      FROM swaps
      WHERE swapTime BETWEEN ${parsedStartTimestamp} AND ${parsedEndTimestamp}
      AND dexKey IN (${parsedDexKeys.join(',')})
      AND addressRef IN (${addressRefs.join(',')})
      AND (tokenInRef IN (${tokenRefs.join(',')}) OR tokenOutRef IN (${tokenRefs.join(',')}));`;
  
  try {
    const swapsResult = await clickhouse.query({
      query: swapsQuery,
      format: 'JSONEachRow'
    });

    return await swapsResult.json();
  } catch (error) {
    console.error('Error fetching transactions by tokens and addresses:', error);
    throw error;
  }
}