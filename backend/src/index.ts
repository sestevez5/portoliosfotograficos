import express from 'express';
import cors from 'cors';
import { catalogoRouter } from './routes/catalogo.routes.js';
import { fotosDir } from './config/rutas.js';
import { gestionarErrores } from './gestionar-errores.js';
import { servirMiniaturas } from './routes/miniaturas.routes.js';

const PORT = process.env.PORT ?? 3000;

const app = express();
// credentials: el navegador envía la cookie de sesión a la API (en desarrollo la web está en otro
// puerto; en Docker nginx sirve las dos desde el mismo origen). origin: true refleja el origen de
// la petición, que es obligatorio (en vez de "*") para admitir credenciales.
app.use(cors({ origin: true, credentials: true }));
app.use('/api', catalogoRouter);
// Con ?ancho=<ancho>, la miniatura de la foto; sin él, la original. dotfiles: 'ignore' no sirve nada
// con un segmento que empiece por punto (papeleras, subidas a medias); por defecto express.static
// sí serviría los ficheros de dentro de una carpeta con punto.
app.use('/photos', servirMiniaturas, express.static(fotosDir, { dotfiles: 'ignore' }));
app.use(gestionarErrores);

app.listen(PORT, () => {
  console.log(`API del portfolio escuchando en http://localhost:${PORT}`);
});
