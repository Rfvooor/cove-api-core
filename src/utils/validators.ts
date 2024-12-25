function validateTimestamps(timestamp: string): boolean {
    // Check if timestamp is a valid number
    const timestampNum = Number(timestamp);
    if (isNaN(timestampNum)) {
        return false;
    }

    // Check if timestamp is a reasonable Unix timestamp (between 2020 and 2100)
    const minTimestamp = 1577836800000; // Jan 1 2020
    const maxTimestamp = 4102444800000; // Jan 1 2100
    
    return timestampNum >= minTimestamp && timestampNum <= maxTimestamp;
}

function validatePeriod(period: string): boolean {
    // Valid periods should match pattern: number followed by s/m/h/d/w
    const periodRegex = /^(\d+)(s|m|h|d|w)$/;
    const match = period.match(periodRegex);
    
    if (!match) return false;
    
    const [_, value, unit] = match;
    const numValue = parseInt(value);

    // Validate based on unit
    switch(unit) {
        case 's':
            return numValue >= 1 && numValue <= 3600; // Up to 1 hour in seconds
        case 'm':
            return numValue >= 1 && numValue <= 60;
        case 'h': 
            return numValue >= 1 && numValue <= 24;
        case 'd':
            return numValue >= 1 && numValue <= 7;
        case 'w':
            return numValue >= 1 && numValue <= 52; // Up to 1 year in weeks
        default:
            return false;
    }
}

function validateDexes(dexes: string): boolean {
    // Check if dexes is comma-separated string and has valid values
    const dexArray = dexes.split(',');
    const validDexes = ['raydium', 'pump', 'jupiter', 'orca', 'meteora', 'moonshot'];
    return dexArray.every(dex => validDexes.includes(dex));
}

function validateAddresses(addresses: string[]): boolean {
    // Check if addresses is array
    if (!Array.isArray(addresses)) {
        return false;
    }

    // Validate each address is a valid Solana address (base58 string of length 32-44)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return addresses.every(address => base58Regex.test(address));
}

function validateTokens(tokens: string[]): boolean {
    // Token addresses follow same format as regular addresses
    return validateAddresses(tokens);
}

export { validatePeriod, validateTimestamps, validateDexes, validateTokens, validateAddresses };
