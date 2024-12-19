# API Documentation

This document provides an overview of the available API endpoints and their usage.

## Authentication

All API endpoints require authentication using an API key. To obtain an API key, follow these steps:

1. Connect your wallet to the application.
2. Generate an API key by making a POST request to `/api/users/generate-key` with your wallet address.
3. Include the API key in the `x-api-key` header for all subsequent API requests.

## Rate Limits

The API endpoints have rate limits based on the user's credit balance. The rate limits are as follows:

| Credit Balance | Transactions | Transactions Enrich | Tokens Stats |
|----------------|--------------|---------------------|--------------|
| >= 1,000,000   | 2000/min     | 1000/min            | 5000/min     |
| >= 100,000     | 500/min      | 250/min             | 1000/min     |
| >= 10,000      | 100/min      | 50/min              | 200/min      |

If a user exceeds the rate limit for their credit balance tier, they will receive a "Too many requests" error message.

## Endpoints

### Transactions

- **URL:** `/api/transactions`
- **Method:** GET
- **Query Parameters:**
  - `startTimestamp` (optional): Start timestamp for filtering transactions.
  - `endTimestamp` (optional): End timestamp for filtering transactions.
  - `period` (optional): Time period for filtering transactions (e.g., '5m', '1h', '1d'). Default is '5m'.
  - `dexes` (optional): Comma-separated list of DEX names to filter transactions (e.g., 'raydium,pump,jupiter'). Default is all DEXes.
  - `enrich` (optional): Boolean flag to indicate whether to enrich the transaction data. Default is false.
- **Response:**
  - `200 OK`: Returns an array of transaction objects.
  - `403 Forbidden`: Insufficient credits to perform the request.
  - `500 Internal Server Error`: An error occurred while processing the request.

### Enrich Transactions

- **URL:** `/api/transactions/enrich`
- **Method:** POST
- **Request Body:**
  - An array of transaction objects to enrich.
- **Response:**
  - `200 OK`: Returns an array of enriched transaction objects.
  - `403 Forbidden`: Insufficient credits to perform the request.
  - `500 Internal Server Error`: An error occurred while processing the request.

### Token Stats

- **URL:** `/api/tokens/stats`
- **Method:** GET
- **Response:**
  - `200 OK`: Returns token statistics.
  - `403 Forbidden`: Insufficient credits to perform the request.
  - `500 Internal Server Error`: An error occurred while processing the request.

## Credits

To add credits to your account, make a POST request to `/api/users/add-credits` with the following parameters:

- `walletAddress`: Your wallet address.
- `credits`: The number of credits to add.

Credits can be bought at the rate of 1 $COVE = 100 credits. 

Each API request consumes a certain amount of credits based on the endpoint and the size of the response data. Make sure you have sufficient credits before making API requests.

## Error Handling

The API endpoints may return the following error responses:

- `401 Unauthorized`: The API key is missing or invalid.
- `403 Forbidden`: The user has insufficient credits to perform the request.
- `429 Too Many Requests`: The user has exceeded the rate limit for their credit balance tier.
- `500 Internal Server Error`: An unexpected error occurred while processing the request.

Please make sure to handle these error responses appropriately in your client application. 

EVERYTHING IS SUBJECT TO CHANGE
