import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

export const mysqlConnection = new Sequelize(
    process.env.MYSQL_DATABASE ?? 'mysql_database',
    process.env.MYSQL_USER ?? 'nouserishere', 
    process.env.MYSQL_PASSWORD ?? 'nopasswordishere',
    {
        host: process.env.MYSQL_HOST,
        dialect: 'mysql',
        logging: false,
        pool: {
            max: 2000,
            min: 0,
            acquire: 30000,
            idle: 60000
        }
    }
);
