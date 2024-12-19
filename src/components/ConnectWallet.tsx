import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';
import { dediConnection as connection } from '../external/rpc';

const SPL_TOKEN_ADDRESS = 'DcU8uHn7abXgYL8AJUK3t8FckeAXrNcGYYBK7uBFpump';
const COVE_TOKEN_AMOUNT = 100_000;


const ConnectWallet: React.FC = () => {
  const { publicKey } = useWallet();
  const [apiKey, setApiKey] = useState('');
  const [credits, setCredits] = useState(0);
  const [hasEnoughTokens, setHasEnoughTokens] = useState(false);

  const checkTokenBalance = async () => {
    if (!publicKey) return;

    try {
      const userTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(SPL_TOKEN_ADDRESS),
        publicKey
      );
      const tokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
      setHasEnoughTokens(tokenBalance.value.uiAmount ? tokenBalance.value.uiAmount >= COVE_TOKEN_AMOUNT : false);
    } catch (error) {
      console.error('Error checking token balance:', error);
      setHasEnoughTokens(false);
    }
  };

  React.useEffect(() => {
    if (publicKey) {
      checkTokenBalance();
    }
  }, [publicKey]);

  const generateApiKey = async () => {
    if (!publicKey || !hasEnoughTokens) return;

    try {
      const response = await axios.post('/api/users/generate-key', { walletId: publicKey.toBase58() });
      setApiKey(response.data.apiKey);
      setCredits(1000);
    } catch (error) {
      console.error('Error generating API key:', error);
    }
  };

  return (
    <div className="list-container">
      <h2>[ SYSTEM: API CONNECTION ]</h2>
      {publicKey ? (
        <div className="wallet-card">
          <div className="wallet-info">
            <p className="wallet-address">Connected: {publicKey.toBase58()}</p>
            {hasEnoughTokens ? (
              apiKey ? (
                <div>
                  <p className="token-list">API Key: {apiKey}</p>
                  <p className="token-list">Credits: {credits}</p>
                </div>
              ) : (
                <button 
                  onClick={generateApiKey}
                  style={{
                    background: '#4CAF50',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    color: '#f0f0f0',
                    cursor: 'pointer',
                    marginTop: '10px'
                  }}
                >
                  Generate API Key
                </button>
              )
            ) : (
              <p className="token-list" style={{color: '#ff9800'}}>
                Insufficient COVE tokens. You need at least 100,000 COVE to generate an API key.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p style={{color: '#f0f0f0', fontFamily: 'Courier New, monospace'}}>
          Please connect your wallet to continue...
        </p>
      )}
    </div>
  );
};

export default ConnectWallet;