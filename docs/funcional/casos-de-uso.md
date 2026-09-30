# Casos de uso

Lista de todo lo que un usuario puede hacer hoy en la aplicación, con una descripción breve y las
condiciones para poder hacerlo. Pensada para quien necesita saber qué hace la aplicación sin leer el código.

Corresponde a la versión 2.0.0 más los cambios en desarrollo a 30 de septiembre de 2026 (resaltado de la
tarjeta propia y visibilidad de portfolios y colecciones).

## Actores

| Actor | Quién es | Qué puede hacer, en resumen |
|---|---|---|
| **Visitante** | Cualquiera que entra sin iniciar sesión. | Consultar el catálogo visible, registrarse e iniciar sesión. |
| **Fotógrafo** | Usuario registrado, con su página de fotógrafo. | Lo del visitante, más gestionar lo suyo: sus datos, su foto de perfil, sus portfolios, colecciones y fotos. |
| **Administrador** | El usuario especial `admin`. Solo hay uno y no tiene página de fotógrafo. | Gestionar lo de cualquier fotógrafo, dar de alta fotógrafos y configurar la aplicación en su primer uso. |

En las tablas, **dueño** es el fotógrafo al que pertenece lo que se modifica. Donde dice "dueño o
administrador", cualquier otro usuario con sesión recibe un rechazo por falta de permiso, y un visitante,
por falta de sesión. En la web, además, los botones correspondientes no se le muestran.

## Restricciones comunes

Se aplican a varios casos de uso y no se repiten en cada uno:

- **Nombres que acaban en la dirección.** El nombre informal de un fotógrafo y el nombre de un portfolio o
  de una colección se convierten en su dirección web y en el nombre de su carpeta (minúsculas, sin tildes,
  espacios como guiones, "ñ" como "ny"). Por eso se rechaza un nombre que, una vez convertido, coincida
  con otro del mismo nivel ("Ciudad de noche" y "ciudad-de noche" son el mismo), que contenga `/` o `\`, o
  que empiece por punto.
- **Lo oculto no existe para los demás.** Un portfolio o una colección ocultos solo los ven su dueño y el
  administrador. Para cualquier otro no aparecen en ningún listado ni total, y su dirección y las de sus
  fotos responden "no encontrado".
- **Confirmación al eliminar con contenido.** Eliminar algo que contiene otros elementos pide confirmación
  expresa antes de borrarlo todo.
- **Primer uso.** Hasta que el administrador completa el primer uso (CU-32), cualquier dirección lleva a
  la pantalla de bienvenida y no se puede usar nada más.

## Consulta del catálogo

| Id | Caso de uso | Descripción | Quién | Restricciones |
|---|---|---|---|---|
| CU-01 | Ver la lista de fotógrafos | Portada con una tarjeta por fotógrafo: nombre, descripción (recortada a 70 caracteres) y número de portfolios y colecciones. La tarjeta del fotógrafo con la sesión iniciada aparece resaltada y marcada con "Tú". | Todos | Los totales solo cuentan lo que puede ver quien mira. |
| CU-02 | Ver los portfolios de un fotógrafo | Página del fotógrafo con sus datos y una tarjeta por portfolio: portada, nombre, descripción y número de colecciones. | Todos | Los portfolios ocultos solo los ven el dueño y el administrador, marcados como "Oculto". |
| CU-03 | Ver las colecciones de un portfolio | Página del portfolio con una tarjeta por colección: portada y nombre. | Todos | Si el portfolio está oculto, solo el dueño y el administrador. Las colecciones ocultas, igual, marcadas como "Oculta". |
| CU-04 | Ver las fotos de una colección | Página de la colección con la cuadrícula de sus fotos. | Todos | Si la colección o su portfolio están ocultos, solo el dueño y el administrador. |
| CU-05 | Ver una foto a tamaño grande | Visor a pantalla completa sobre la colección. Se pasa de foto con las flechas y se cierra con Escape. | Todos | Las mismas que CU-04. |
| CU-06 | Cambiar entre tema claro y oscuro | Selector en la franja superior. La elección se recuerda en ese navegador. | Todos | Ninguna. |

## Cuenta y sesión

| Id | Caso de uso | Descripción | Quién | Restricciones |
|---|---|---|---|---|
| CU-07 | Registrarse como fotógrafo | Formulario con los datos de acceso (usuario, correo y contraseña) y los del fotógrafo (nombre informal, nombre, apellidos, descripción y, si quiere, foto de perfil). Crea la cuenta y su página, y deja la sesión iniciada. | Visitante | Usuario, correo, contraseña, nombre informal, nombre y primer apellido son obligatorios. Usuario de 3 a 30 caracteres (letras sin tildes, números, `.`, `_`, `-`; empieza por letra o número) y no repetido. Correo con formato válido y no repetido. Contraseña de 8 caracteres o más. El nombre informal no puede coincidir con el de otro fotógrafo ni ser una palabra reservada (`admin`, `api`, `configuracion`, `gestion`, `perfil`, `photos`, `registro`). |
| CU-08 | Iniciar sesión | Con el nombre de usuario o el correo, y la contraseña. La sesión dura 30 días en ese navegador. | Visitante | Credenciales correctas. El aviso es el mismo si el usuario no existe que si la contraseña no coincide. |
| CU-09 | Cerrar sesión | Opción "Salir" del menú del usuario. Vuelve a la portada. | Fotógrafo, administrador | Tener la sesión iniciada. |
| CU-10 | Ver "Mi perfil" | Sus datos de cuenta y, si es fotógrafo, sus datos, su firma y sus totales, con enlaces a su página, a editar sus datos y a la configuración. | Fotógrafo, administrador | Tener la sesión iniciada; sin ella, lleva a la portada. |
| CU-11 | Elegir el tema preferido | En "Configuración": claro u oscuro. Se guarda en la cuenta y se aplica al iniciar sesión en cualquier navegador. | Fotógrafo, administrador | Tener la sesión iniciada. |

## Datos del fotógrafo

| Id | Caso de uso | Descripción | Quién | Restricciones |
|---|---|---|---|---|
| CU-12 | Editar los datos de un fotógrafo | Nombre informal, nombre, apellidos, correo, descripción y contraseña. Si cambia el nombre informal, cambian con él su dirección, su carpeta de fotos y su firma. | Dueño o administrador | Las mismas de formato y duplicados que en el registro (CU-07). Dejar la contraseña vacía conserva la actual. |
| CU-13 | Poner o cambiar la foto de perfil | Desde un archivo o desde la cámara; se encuadra dentro de un círculo (mover y ampliar hasta ×4) y se guarda recortada. | Dueño o administrador | La cámara solo funciona en una conexión segura (https o `localhost`). La imagen recortada no puede pasar de 2 MB. |
| CU-14 | Quitar la foto de perfil | Vuelve a mostrarse el círculo con las iniciales. | Dueño o administrador | Ninguna más. |
| CU-15 | Eliminar un fotógrafo | Borra su cuenta, sus portfolios, colecciones y fotos, su carpeta y su firma. | Dueño o administrador | Si tiene portfolios, pide confirmación. No se puede deshacer. |

## Portfolios

| Id | Caso de uso | Descripción | Quién | Restricciones |
|---|---|---|---|---|
| CU-16 | Añadir un portfolio | Nombre y descripción opcional. Se añade al final de los del fotógrafo y nace visible. | Dueño o administrador | Nombre obligatorio y distinto del de sus otros portfolios (ver "Nombres que acaban en la dirección"). |
| CU-17 | Editar un portfolio | Cambiar el nombre y la descripción. Si cambia el nombre, cambian su dirección y su carpeta. | Dueño o administrador | Las mismas que al añadirlo. |
| CU-18 | Eliminar un portfolio | Lo borra con sus colecciones, sus fotos y su carpeta. | Dueño o administrador | Si tiene colecciones, pide confirmación. No se puede deshacer. |
| CU-19 | Ordenar los portfolios | En "Gestionar portfolios", arrastrando cada tarjeta a su sitio. Se guarda al soltar. | Dueño o administrador | Hacen falta al menos dos portfolios. No funciona en pantallas táctiles. Si entretanto se ha creado o eliminado un portfolio, el orden se rechaza y vuelve al anterior. |
| CU-20 | Ocultar o mostrar un portfolio | En "Gestionar portfolios", con el ojo de su tarjeta: ojo normal si lo puede ver cualquiera, ojo tachado si está oculto. | Dueño o administrador | Ocultarlo oculta también todas sus colecciones y fotos, aunque estén marcadas como visibles. |

## Colecciones

| Id | Caso de uso | Descripción | Quién | Restricciones |
|---|---|---|---|---|
| CU-21 | Añadir una colección | Nombre, descripción opcional y etiquetas separadas por comas. Se añade al final de las del portfolio y nace visible. | Dueño o administrador | Nombre obligatorio y distinto del de las otras colecciones del portfolio. Sin etiquetas repetidas. |
| CU-22 | Editar una colección | Cambiar nombre, descripción y etiquetas. Si cambia el nombre, cambian su dirección y su carpeta. | Dueño o administrador | Las mismas que al añadirla. |
| CU-23 | Eliminar una colección | La borra con sus fotos y su carpeta. | Dueño o administrador | Si tiene fotos, pide confirmación. No se puede deshacer. |
| CU-24 | Ordenar las colecciones | En "Gestionar colecciones", arrastrando cada tarjeta a su sitio. Se guarda al soltar. | Dueño o administrador | Como en CU-19: al menos dos colecciones, sin pantallas táctiles, y se rechaza si la lista ha cambiado entretanto. |
| CU-25 | Elegir la portada del portfolio | En "Gestionar colecciones", con la estrella de una colección: su portada pasa a ser la del portfolio. Pulsar la elegida la quita. | Dueño o administrador | Tiene que ser una colección de ese portfolio. Sin ninguna elegida, la portada es la de la primera colección. Si la elegida está oculta, los demás ven la de la primera colección visible. |
| CU-26 | Ocultar o mostrar una colección | En "Gestionar colecciones", con el ojo de su tarjeta. | Dueño o administrador | Una colección visible sigue sin verse si su portfolio está oculto. |

## Fotos de una colección

Todo se hace en "Gestionar fotos", desde la página de la colección.

| Id | Caso de uso | Descripción | Quién | Restricciones |
|---|---|---|---|---|
| CU-27 | Añadir fotos | Arrastrándolas a la zona de subida o eligiéndolas en el equipo, varias a la vez. Se suben de una en una, en ese orden, y se añaden al final. Las que se rechazan quedan en una lista con el motivo. | Dueño o administrador | Solo JPEG, PNG o WebP (se comprueba el contenido, no la extensión). Máximo 25 MB por foto. No puede haber ya en la colección un fichero con el mismo nombre. |
| CU-28 | Poner título a una foto | En el cuadro de texto bajo la foto. Se guarda al salir del cuadro o con Intro; Escape lo deshace. | Dueño o administrador | Máximo 19 caracteres. Vacío equivale a "Sin título". |
| CU-29 | Elegir la foto de portada | Con la estrella de una foto. Pulsar la elegida la quita. | Dueño o administrador | Tiene que ser una foto de esa colección. Sin ninguna elegida, la portada es la primera foto. |
| CU-30 | Ordenar las fotos | Arrastrando cada foto a su sitio. Se guarda al soltar; Escape cancela. | Dueño o administrador | No funciona en pantallas táctiles. No se puede ordenar mientras se sube o se elimina una foto, ni mientras se escribe un título. |
| CU-31 | Eliminar una foto | Borra la foto y su fichero, tras confirmarlo. | Dueño o administrador | No se puede deshacer. Si era la portada, pasa a serlo la primera. |

## Administración

| Id | Caso de uso | Descripción | Quién | Restricciones |
|---|---|---|---|---|
| CU-32 | Completar el primer uso | Pantalla de bienvenida de una instalación nueva: pide las credenciales del administrador (`admin` / `admin` de inicio) y ofrece cambiar la contraseña. Al terminar, deja su sesión iniciada. | Administrador | Solo una vez: después ya no está disponible. La contraseña nueva, si se indica, de 8 caracteres o más. |
| CU-33 | Cambiar la contraseña del administrador | Pide la contraseña actual y la nueva. | Administrador | Contraseña actual correcta y nueva de 8 caracteres o más. No tiene enlace en la web: se entra por su dirección, `/admin/contrasenya`. |
| CU-34 | Dar de alta un fotógrafo | El mismo formulario que el registro, sin elegir el nombre de usuario: lo calcula la aplicación (inicial del nombre más las tres primeras letras del primer apellido, con un número si se repite). | Administrador | Nombre informal, nombre y primer apellido obligatorios; correo y contraseña opcionales. Las mismas reglas de formato y duplicados que CU-07. No tiene enlace en la web: se entra por `/admin/fotografos/nuevo`. |
| CU-35 | Gestionar lo de cualquier fotógrafo | El administrador puede hacer los casos CU-12 a CU-31 sobre cualquier fotógrafo, y ve todo lo oculto. | Administrador | Ninguna más que las de cada caso. |

## Fuera de alcance

No son casos de uso de la web, aunque existen o están previstos:

- **Tareas de mantenimiento por línea de comandos**, para quien administra la instalación: cargar un
  catálogo completo desde un fichero JSON y renombrar un fotógrafo, un portfolio o una colección.
- **Buscar colecciones por etiqueta.** Las etiquetas se guardan y la API permite filtrar por ellas, pero la
  web todavía no ofrece ninguna pantalla para hacerlo.
- **Recuperar una contraseña olvidada.** No existe.
- **Ordenar en pantallas táctiles.** El arrastre no funciona en móviles ni tabletas.
