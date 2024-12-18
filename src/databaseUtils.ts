import { Op } from 'sequelize';
import { Tokens, Wallets } from './models/models';
import { retryAsync } from './utils';

export const getTokenMappings = async (uniqueRefs: number[]) => {
    return await retryAsync(async () => {
        const tokens = await Tokens.findAll({
            where: { id: uniqueRefs },
        });
        return tokens.reduce((map, token) => {
            map[Number(token.id)] = { address: token.address, tokenSupply: token.tokenSupply, bundleAmt: token.bundleAmt };
            return map;
        }, {});
    });
};

export const getTokenMappingsByAddresses = async (addresses: string[]) => {
    return await retryAsync(async () => {
        const tokens = await Tokens.findAll({
            where: { address: { [Op.in]: addresses } },
        });
        return tokens.reduce((map, token) => {
            map[Number(token.id)] = { address: token.address, tokenSupply: token.tokenSupply, bundleAmt: token.bundleAmt };
            return map;
        }, {});
    });
};

export const getWalletMappings = async (uniqueRefs: number[]) => {
    return await retryAsync(async () => {
        const wallets = await Wallets.findAll({
            where: { id: uniqueRefs },
        });
        return wallets.reduce((map, wallet) => {
            map[Number(wallet.id)] = { address: wallet.address, txnCount: wallet.txnCount, usdValue: wallet.usdValue };
            return map;
        }, {});
    });
};

export const getWalletMappingsByAddresses = async (addresses: string[]) => {
    return await retryAsync(async () => {
        const wallets = await Wallets.findAll({
            where: { address: { [Op.in]: addresses } },
        });
        return wallets.reduce((map, wallet) => {
            map[Number(wallet.id)] = { address: wallet.address, txnCount: wallet.txnCount, usdValue: wallet.usdValue };
            return map;
        }, {});
    });
};