import express from 'express';
import apiRoutes from './routes/api';
import { mysqlConnection } from './external/mysql';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use('/api', apiRoutes);

const port = Number(process.env.PORT) || 3000;

mysqlConnection.sync()
  .then(() => {
    app.listen(port, '67.220.67.130', () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => console.log(error));