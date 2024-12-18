import express from 'express';
import apiRoutes from './routes/api';

const app = express();

app.use('/api', apiRoutes);

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});