import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

const rateLimits = {
  10000: {
    transactions: 100,
    transactionsEnrich: 50,
    tokensStats: 200,
  },
  100000: {
    transactions: 500,
    transactionsEnrich: 250,
    tokensStats: 1000,
  },
  1000000: {
    transactions: 2000,
    transactionsEnrich: 1000,
    tokensStats: 5000,
  },
};

export const rateLimiter = (apiName: keyof typeof rateLimits[keyof typeof rateLimits]) => {
  return (req: Request, res: Response, next: Function) => {
    const user = (req as any).user;
    const creditBalance = user.creditBalance;

    let limit = 0;
    if (creditBalance >= 1000000) {
      limit = rateLimits[1000000][apiName];
    } else if (creditBalance >= 100000) {
      limit = rateLimits[100000][apiName];
    } else if (creditBalance >= 10000) {
      limit = rateLimits[10000][apiName];
    }

    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: limit,
      message: 'Too many requests, please try again later.',
    });

    limiter(req, res, next);
  };
}; 