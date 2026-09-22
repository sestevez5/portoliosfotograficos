// En producción (Docker/NAS) nginx sirve el frontend y hace de proxy inverso
// de /api y /photos hacia el backend, así que las peticiones son same-origin.
export const API_BASE_URL = '';
