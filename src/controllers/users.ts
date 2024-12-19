import { Request, Response, NextFunction } from 'express';
import { User } from '../models/models';
import { generateApiKey } from '../utils/utils';

export const generateApiKeyForUser = async (req: Request, res: Response) => {
  const { walletAddress } = req.body;

  try {
    let user = await User.findOne({ where: { walletAddress } });

    if (!user) {
      const apiKey = generateApiKey();
      user = await User.create({ walletAddress, apiKey, creditBalance: 0 });
    }

    res.json({ apiKey: (user as any).apiKey, credits: (user as any).creditBalance });
  } catch (error) {
    res.status(500).json({ error: 'Error generating API key' });
  }
};

export const addCreditsToUser = async (req: Request, res: Response) => {
  const { walletAddress, credits } = req.body;

  try {
    const user = await User.findOne({ where: { walletAddress } });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    (user as any).creditBalance += credits;
    await user.save();

    res.json({ credits: (user as any).creditBalance });
  } catch (error) {
    res.status(500).json({ error: 'Error adding credits' });
  }
};

export const verifyApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    res.status(401).json({ error: 'API key is missing' });
    return;
  }

  try {
    const user = await User.findOne({ where: { apiKey } });

    if (!user) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    if ((user as any).creditBalance <= 0) {
      res.status(403).json({ error: 'Insufficient credits' });
      return;
    }

    // Extend Request type to include user property
    (req as any).user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error verifying API key' });
  }
};