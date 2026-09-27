import express from 'express';
import cors from 'cors';
import { albumsRouter } from './routes/albums.routes.js';
import { fotosDir } from './config/rutas.js';
import { gestionarErrores } from './gestionar-errores.js';

const PORT = process.env.PORT ?? 3000;

const app = express();
app.use(cors());
app.use('/api', albumsRouter);
app.use('/photos', express.static(fotosDir));
app.use(gestionarErrores);

app.listen(PORT, () => {
  console.log(`API del portfolio escuchando en http://localhost:${PORT}`);
});
