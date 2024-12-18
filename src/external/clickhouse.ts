import { createClient } from '@clickhouse/client';
import dotenv from 'dotenv';

dotenv.config();

export const clickhouse = createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    max_open_connections: 1000,
});

