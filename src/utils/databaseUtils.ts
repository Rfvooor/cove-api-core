import { Op } from 'sequelize';
import { Tokens, Wallets } from '../models/models';
import { retryAsync } from '../utils/utils';

interface TokenMapping {
    address: string;
    tokenSupply: number;
    bundleAmt: number;
}

interface WalletMapping {
    address: string;
    txnCount: number;
    usdValue: number;
}

export const getTokenMappings = async (uniqueRefs: number[]) => {
    return await retryAsync(async () => {
        const tokens = await Tokens.findAll({
            where: { id: uniqueRefs },
        });
        return tokens.reduce<Record<number, TokenMapping>>((map, token) => {
            map[Number(token.id)] = { address: token.address, tokenSupply: Number(token.tokenSupply), bundleAmt: Number(token.bundleAmt) };
            return map;
        }, {});
    });
};

export const getTokenMappingsByAddresses = async (addresses: string[]) => {
    return await retryAsync(async () => {
        const tokens = await Tokens.findAll({
            where: { address: { [Op.in]: addresses } },
        });
        return tokens.reduce<Record<number, TokenMapping>>((map, token) => {
            map[Number(token.id)] = { address: token.address, tokenSupply: Number(token.tokenSupply), bundleAmt: Number(token.bundleAmt) };
            return map;
        }, {});
    });
};

export const getWalletMappings = async (uniqueRefs: number[]) => {
    return await retryAsync(async () => {
        const wallets = await Wallets.findAll({
            where: { id: uniqueRefs },
        });
        return wallets.reduce<Record<number, WalletMapping>>((map, wallet) => {
            map[Number(wallet.id)] = { address: wallet.address, txnCount: Number(wallet.txnCount), usdValue: Number(wallet.usdValue) };
            return map;
        }, {});
    });
};

export const getWalletMappingsByAddresses = async (addresses: string[]) => {
    return await retryAsync(async () => {
        const wallets = await Wallets.findAll({
            where: { address: { [Op.in]: addresses } },
        });
        return wallets.reduce<Record<number, WalletMapping>>((map, wallet) => {
            map[Number(wallet.id)] = { address: wallet.address, txnCount: Number(wallet.txnCount), usdValue: Number(wallet.usdValue) };
            return map;
        }, {});
    });
};