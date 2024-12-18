import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const dediConnection = new Connection(process.env.DEDI_RPC_URL ?? '', {
    commitment: 'processed',
    disableRetryOnRateLimit: false,
});

const chainstackConnection1 = new Connection(`https://solana-mainnet.core.chainstack.com/${process.env.CHAINSTACK_API_KEY1}`, {
    commitment: 'processed',
    disableRetryOnRateLimit: false,
    wsEndpoint: `wss://solana-mainnet.core.chainstack.com/${process.env.CHAINSTACK_API_KEY1}`
});

const chainstackConnection2 = new Connection(`https://solana-mainnet.core.chainstack.com/${process.env.CHAINSTACK_API_KEY2}`, {
    commitment: 'processed',
    disableRetryOnRateLimit: false,
    wsEndpoint: `wss://solana-mainnet.core.chainstack.com/${process.env.CHAINSTACK_API_KEY2}`
});

export { dediConnection, chainstackConnection1, chainstackConnection2 };
