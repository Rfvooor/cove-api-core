import express from 'express';
import apiRoutes from './routes/api';
import { mysqlConnection } from './external/mysql';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(express.json());
app.use('/api', apiRoutes);

const port = process.env.PORT || 3000;

mysqlConnection.sync()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => console.log(error));