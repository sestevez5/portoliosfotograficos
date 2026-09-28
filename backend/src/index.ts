import express from 'express';
import cors from 'cors';
import { albumsRouter } from './routes/albums.routes.js';
import { fotosDir } from './config/rutas.js';
import { gestionarErrores } from './gestionar-errores.js';

const PORT = process.env.PORT ?? 3000;

const app = express();
// credentials: el navegador envía la cookie de sesión a la API (en desarrollo la web está en otro
// puerto; en Docker nginx sirve las dos desde el mismo origen). origin: true refleja el origen de
// la petición, que es obligatorio (en vez de "*") para admitir credenciales.
app.use(cors({ origin: true, credentials: true }));
app.use('/api', albumsRouter);
app.use('/photos', express.static(fotosDir));
app.use(gestionarErrores);

app.listen(PORT, () => {
  console.log(`API del portfolio escuchando en http://localhost:${PORT}`);
});
