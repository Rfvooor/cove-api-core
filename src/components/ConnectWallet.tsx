import React, { useState } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createBurnInstruction } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';
import { dediConnection as connection } from '../external/rpc';

const SPL_TOKEN_ADDRESS = 'DcU8uHn7abXgYL8AJUK3t8FckeAXrNcGYYBK7uBFpump';

const ConnectWallet: React.FC = () => {
  const { publicKey, signTransaction } = useWallet();
  const [apiKey, setApiKey] = useState('');
  const [credits, setCredits] = useState(0);
  const [burnAmount, setBurnAmount] = useState(100);

  const generateApiKey = async () => {
    if (!publicKey) return;

    try {
      const response = await axios.post('/api/users/generate-key', { walletId: publicKey.toBase58() });
      setApiKey(response.data.apiKey);
      setCredits(response.data.credits);
    } catch (error) {
      console.error('Error generating API key:', error);
    }
  };

  const burnTokens = async (amount: number) => {
    if (!publicKey || !signTransaction) return;
    if (amount <= 0 || amount > 1_000_000) {
      console.error('Invalid burn amount. Must be between 1 and 1,000,000');
      return;
    }

    try {
      const userTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(SPL_TOKEN_ADDRESS),
        publicKey
      );

      const transaction = new Transaction().add(
        createBurnInstruction(
          userTokenAccount,
          new PublicKey(SPL_TOKEN_ADDRESS),
          publicKey,
          amount,
          []
        )
      );

      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      const bh = await connection.getLatestBlockhash();
      const lastValidBlockHeight = bh.lastValidBlockHeight;
      const blockhash = bh.blockhash;
      const confirmation = await connection.confirmTransaction({signature, blockhash, lastValidBlockHeight}, 'confirmed');
      if (!confirmation) {
        console.error('Transaction confirmation failed');
        return;
      }

      const response = await axios.post('/api/users/add-credits', {
        walletAddress: publicKey.toBase58(),
        credits: amount * 100,
      });
      setCredits(response.data.credits);
    } catch (error) {
      console.error('Error burning tokens:', error);
    }
  };

  return (
    <div>
      {publicKey ? (
        <div>
          <p>Connected Wallet: {publicKey.toBase58()}</p>
          {apiKey ? (
            <div>
              <p>API Key: {apiKey}</p>
              <p>Credits: {credits}</p>
              <input 
                type="number"
                min="1"
                max="1000000"
                value={burnAmount}
                onChange={(e) => setBurnAmount(parseInt(e.target.value))}
              />
              <button onClick={() => burnTokens(burnAmount)}>Burn Tokens</button>
            </div>
          ) : (
            <button onClick={generateApiKey}>Generate API Key</button>
          )}
        </div>
      ) : (
        <p>Please connect your wallet</p>
      )}
    </div>
  );
};

export default ConnectWallet;