import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { albumsRouter } from './routes/albums.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;

const app = express();
app.use(cors());
app.use('/api', albumsRouter);
app.use('/photos', express.static(path.resolve(__dirname, '../photos')));

app.listen(PORT, () => {
  console.log(`API del portfolio escuchando en http://localhost:${PORT}`);
});
