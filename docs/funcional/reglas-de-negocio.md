# Reglas de negocio

Catálogo de todo lo que la aplicación no permite: cada regla con su código, lo que exige, el mensaje que
recibe el usuario y las operaciones en las que se comprueba. Para quien necesita saber qué restricciones
aplica la aplicación, y para quien las mantiene.

Corresponde a la versión 2.0.0 más los cambios en desarrollo a 30 de septiembre de 2026. Los códigos y
los mensajes de este documento están copiados tal cual del catálogo del código.

## Cómo están organizadas

Las reglas no están repartidas por el código: se definen en un único fichero,
`backend/src/reglas/catalogo.ts`, que contiene dos listas.

- **Reglas** (38): un código y el mensaje que explica qué se ha incumplido.
- **Operaciones** (27): un código y la descripción de lo que se intentaba hacer.

Cuando una operación incumple una regla, no se guarda nada y el usuario recibe las dos cosas juntas:
"No se ha podido *operación*. *Regla*." Por ejemplo: *No se ha podido crear el portfolio "Viajes" del
fotógrafo "Ana Ruiz". Ya existe otro portfolio con el mismo nombre ("Viajes") para este fotógrafo.*

Los textos entre llaves de los mensajes, como `{nombre}`, se sustituyen por el dato concreto.

La comprobación de casi todas las reglas está también en un solo sitio, `backend/src/reglas/validaciones.ts`.
Tres se comprueban junto a la operación a la que pertenecen: `PRIMER_USO_COMPLETADO` y
`USUARIO_CONTRASENYA_REPETIDA` (en `services/administrador.service.ts`) y `USUARIO_FOTO_NO_VALIDA`
(en `services/foto-perfil.service.ts`); `USUARIO_CREDENCIALES_INCORRECTAS` se comprueba en
`services/sesion.service.ts` y en `services/administrador.service.ts`.

## Preguntas de confirmación

Tres reglas no son una prohibición, sino una pregunta: se incumplen cuando se intenta eliminar algo que
tiene contenido sin haberlo confirmado. La web muestra su mensaje en un diálogo y, si el usuario acepta,
repite la operación confirmándola. Son `FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS`,
`PORTFOLIO_ELIMINAR_CON_COLECCIONES` y `COLECCION_ELIMINAR_CON_FOTOS`.

## Nombres que dan la misma dirección

Varias reglas comparan nombres "por su dirección": el nombre informal de un fotógrafo y el nombre de un
portfolio o de una colección se convierten en su dirección web y en el nombre de su carpeta (minúsculas,
sin tildes, espacios como guiones, "ñ" como "ny"). Dos nombres que dan la misma dirección se consideran
el mismo: "Ciudad de noche", "ciudad de Noche" y "Ciudad-de noche" coinciden.

## Cuenta de usuario

| Código | Qué exige | Mensaje | Se comprueba en |
|---|---|---|---|
| `USUARIO_OBLIGATORIO` | Quien se registra debe indicar un nombre de usuario. | El nombre de usuario es obligatorio. | `REGISTRAR_USUARIO` |
| `USUARIO_NO_VALIDO` | El nombre de usuario tiene de 3 a 30 caracteres, empieza por letra o número y solo usa letras sin tildes, números, `.`, `_` o `-`. Se guarda en minúsculas. | El nombre de usuario "{usuario}" no es válido: debe tener entre 3 y 30 caracteres, empezar por una letra o un número y usar solo letras sin tildes, números, ".", "_" o "-". | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO` |
| `USUARIO_DUPLICADO` | No puede haber dos usuarios con el mismo nombre de usuario. | Ya existe otro usuario con el nombre de usuario "{usuario}". | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO` |
| `USUARIO_EMAIL_OBLIGATORIO` | Quien se registra debe indicar un correo electrónico. | El correo electrónico es obligatorio. | `REGISTRAR_USUARIO` |
| `USUARIO_EMAIL_NO_VALIDO` | El correo, si se indica, debe tener formato de correo. | El correo electrónico "{email}" no tiene un formato válido. | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO` |
| `USUARIO_EMAIL_DUPLICADO` | No puede haber dos usuarios con el mismo correo, sin distinguir mayúsculas. | Ya existe otro usuario con el correo electrónico "{email}". | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO` |
| `USUARIO_CONTRASENYA_OBLIGATORIA` | Quien se registra debe indicar una contraseña. | La contraseña es obligatoria. | `REGISTRAR_USUARIO` |
| `USUARIO_CONTRASENYA_CORTA` | Una contraseña, si se indica, tiene 8 caracteres o más. | La contraseña debe tener al menos {minimo} caracteres. | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO`, `COMPLETAR_PRIMER_USO`, `CAMBIAR_CONTRASENYA_ADMINISTRADOR` |
| `USUARIO_CONTRASENYA_REPETIDA` | Al cambiar la contraseña del administrador, la nueva debe ser distinta de la actual. | La contraseña nueva debe ser distinta de la actual. | `COMPLETAR_PRIMER_USO`, `CAMBIAR_CONTRASENYA_ADMINISTRADOR` |
| `USUARIO_CREDENCIALES_INCORRECTAS` | El usuario (o correo) y la contraseña deben ser los de una cuenta. El mensaje es el mismo si el usuario no existe, no tiene contraseña o no coincide, para no revelar cuál falla. | El usuario o la contraseña no son correctos. | `INICIAR_SESION`, `COMPLETAR_PRIMER_USO`, `CAMBIAR_CONTRASENYA_ADMINISTRADOR` |
| `USUARIO_FOTO_NO_VALIDA` | La foto de perfil es una imagen JPEG de 2 MB como máximo. | La foto de perfil debe ser una imagen JPEG de como máximo {maximo} MB. | `CAMBIAR_FOTO_PERFIL` |

## Administrador y primer uso

| Código | Qué exige | Mensaje | Se comprueba en |
|---|---|---|---|
| `PRIMER_USO_COMPLETADO` | La configuración inicial de la aplicación solo se completa una vez. | La aplicación ya está configurada: el primer uso ya se completó. | `COMPLETAR_PRIMER_USO` |

## Fotógrafos

| Código | Qué exige | Mensaje | Se comprueba en |
|---|---|---|---|
| `FOTOGRAFO_NOMBRE_INFORMAL_OBLIGATORIO` | Todo fotógrafo tiene nombre informal. | El nombre informal del fotógrafo es obligatorio. | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO`, `CAMBIAR_NOMBRE_INFORMAL` |
| `FOTOGRAFO_NOMBRE_OBLIGATORIO` | Todo fotógrafo tiene nombre. | El nombre del fotógrafo es obligatorio. | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO` |
| `FOTOGRAFO_PRIMER_APELLIDO_OBLIGATORIO` | Todo fotógrafo tiene primer apellido. | El primer apellido del fotógrafo es obligatorio. | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO` |
| `FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO` | No puede haber dos fotógrafos cuyo nombre informal dé la misma dirección ("Ana Ruiz" y "ana  ruíz" coinciden). | Ya existe otro fotógrafo con el mismo nombre informal ("{nombreInformal}" coincide con "{otro}"). | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO`, `CAMBIAR_NOMBRE_INFORMAL` |
| `FOTOGRAFO_NOMBRE_INFORMAL_RESERVADO` | La dirección de un fotógrafo no puede coincidir con una que usa la propia aplicación: `admin`, `api`, `configuracion`, `gestion`, `perfil`, `photos` o `registro`. | El nombre informal "{nombreInformal}" no se puede usar: su dirección coincide con una reservada por la aplicación ("{reservado}"). | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO`, `CAMBIAR_NOMBRE_INFORMAL` |
| `FOTOGRAFO_CARPETA_OCUPADA` | La carpeta de fotos que le corresponde al fotógrafo no puede existir ya en el disco. | Ya existe la carpeta "{carpeta}" en datos/fotos; no se puede usar para el fotógrafo "{nombreInformal}". | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO`, `CAMBIAR_NOMBRE_INFORMAL` |
| `FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS` | Un fotógrafo con portfolios solo se elimina si se confirma expresamente. **Es una pregunta de confirmación.** | El usuario que intenta eliminar tiene portfolios creados. Si lo elimina, se perderán de forma permanente sus portfolios, colecciones y fotos. ¿Desea continuar? | `ELIMINAR_FOTOGRAFO` |

## Portfolios

| Código | Qué exige | Mensaje | Se comprueba en |
|---|---|---|---|
| `PORTFOLIO_NOMBRE_OBLIGATORIO` | Todo portfolio tiene nombre. | El nombre del portfolio es obligatorio. | `CREAR_PORTFOLIO`, `EDITAR_PORTFOLIO`, `RENOMBRAR_PORTFOLIO` |
| `PORTFOLIO_NOMBRE_DUPLICADO` | Un fotógrafo no puede tener dos portfolios cuyo nombre dé la misma dirección. | Ya existe otro portfolio con el mismo nombre ("{nombre}") para este fotógrafo. | `CREAR_PORTFOLIO`, `EDITAR_PORTFOLIO`, `RENOMBRAR_PORTFOLIO` |
| `PORTFOLIO_CARPETA_OCUPADA` | La carpeta que le corresponde al portfolio no puede existir ya dentro de la del fotógrafo. | Ya existe la carpeta "{carpeta}" en la del fotógrafo; no se puede usar para el portfolio "{nombre}". | `CREAR_PORTFOLIO`, `EDITAR_PORTFOLIO`, `RENOMBRAR_PORTFOLIO` |
| `PORTFOLIO_ORDEN_NO_VALIDO` | Un nuevo orden nombra todos los portfolios del fotógrafo, cada uno una sola vez. | El nuevo orden debe incluir exactamente los portfolios del fotógrafo "{fotografo}", cada uno una sola vez (puede que otra persona lo haya cambiado: recarga la página). | `ORDENAR_PORTFOLIOS` |
| `PORTFOLIO_COLECCION_PORTADA_INEXISTENTE` | La colección de portada de un portfolio es una de sus colecciones. | La colección de portada "{coleccionPortada}" no pertenece al portfolio "{portfolio}". | `CAMBIAR_PORTADA_PORTFOLIO`, `CREAR_PORTFOLIO` |
| `PORTFOLIO_ELIMINAR_CON_COLECCIONES` | Un portfolio con colecciones solo se elimina si se confirma expresamente. **Es una pregunta de confirmación.** | Este portfolio contiene colecciones. Si lo elimina, se perderán de forma permanente sus colecciones y fotos. ¿Desea continuar? | `ELIMINAR_PORTFOLIO` |

## Colecciones

| Código | Qué exige | Mensaje | Se comprueba en |
|---|---|---|---|
| `COLECCION_NOMBRE_OBLIGATORIO` | Toda colección tiene nombre. | El nombre dla colección es obligatorio. | `CREAR_COLECCION`, `EDITAR_COLECCION`, `RENOMBRAR_COLECCION` |
| `COLECCION_NOMBRE_DUPLICADO` | Un portfolio no puede tener dos colecciones cuyo nombre dé la misma dirección. | Ya existe otra colección con el mismo nombre ("{nombre}") en este portfolio. | `CREAR_COLECCION`, `EDITAR_COLECCION`, `RENOMBRAR_COLECCION` |
| `COLECCION_CARPETA_OCUPADA` | La carpeta que le corresponde a la colección no puede existir ya dentro de la del portfolio. | Ya existe la carpeta "{carpeta}" en la del portfolio; no se puede usar para la colección "{nombre}". | `CREAR_COLECCION`, `EDITAR_COLECCION`, `RENOMBRAR_COLECCION` |
| `COLECCION_TAG_DUPLICADO` | Una colección no repite una etiqueta. | La colección "{coleccion}" tiene el tag "{tag}" repetido. | `CREAR_COLECCION`, `EDITAR_COLECCION` |
| `COLECCION_ORDEN_NO_VALIDO` | Un nuevo orden nombra todas las colecciones del portfolio, cada una una sola vez. | El nuevo orden debe incluir exactamente las colecciones del portfolio "{portfolio}", cada una una sola vez (puede que otra persona lo haya cambiado: recarga la página). | `ORDENAR_COLECCIONES` |
| `COLECCION_FOTO_PORTADA_INEXISTENTE` | La foto de portada de una colección es una de sus fotos. | La foto de portada "{fotoPortada}" no pertenece a la colección "{coleccion}". | `CAMBIAR_PORTADA_COLECCION`, `CREAR_COLECCION` |
| `COLECCION_ELIMINAR_CON_FOTOS` | Una colección con fotos solo se elimina si se confirma expresamente. **Es una pregunta de confirmación.** | Esta colección contiene fotos. Si lo elimina, se perderán de forma permanente sus fotos. ¿Desea continuar? | `ELIMINAR_COLECCION` |

## Fotos

| Código | Qué exige | Mensaje | Se comprueba en |
|---|---|---|---|
| `FOTO_NOMBRE_FICHERO_NO_VALIDO` | El nombre del fichero de una foto no está vacío, no contiene `/` ni `\`, no empieza por punto y no pasa de 200 caracteres. | El nombre de fichero "{nombreFichero}" no es válido: no puede estar vacío, contener "/" ni "\\", empezar por "." ni tener más de {maximo} caracteres. | `ANYADIR_FOTO` |
| `FOTO_FICHERO_DUPLICADO` | Una colección no tiene dos fotos con el mismo nombre de fichero, ni en el catálogo ni en su carpeta. | Ya existe otra foto con el mismo fichero ("{nombreFichero}") en esta colección. | `ANYADIR_FOTO` |
| `FOTO_FORMATO_NO_VALIDO` | Una foto es una imagen JPEG, PNG o WebP (por su contenido, no por su extensión) de 25 MB como máximo. | El fichero "{nombreFichero}" no es una imagen JPEG, PNG o WebP de como máximo {maximo} MB. | `ANYADIR_FOTO` |
| `FOTO_TITULO_DEMASIADO_LARGO` | El título de una foto, si lo tiene, no pasa de 19 caracteres. | El título de una foto debe tener menos de {limite} caracteres ("{titulo}" tiene {longitud}). | `CAMBIAR_TITULO_FOTO`, `ANYADIR_FOTO` |
| `FOTO_ORDEN_NO_VALIDO` | Un nuevo orden nombra todas las fotos de la colección, cada una una sola vez. | El nuevo orden debe incluir exactamente las fotos de la colección "{coleccion}", cada una una sola vez (puede que otra persona la haya cambiado: recarga la página). | `ORDENAR_FOTOS` |

## Comunes a fotógrafos, portfolios y colecciones

| Código | Qué exige | Mensaje | Se comprueba en |
|---|---|---|---|
| `NOMBRE_NO_VALIDO` | Un nombre que da nombre a una carpeta (nombre informal del fotógrafo, nombre de portfolio o de colección) no contiene `/` ni `\` ni empieza por punto. | El nombre "{nombre}" no es válido: no puede contener "/" ni "\\" ni empezar por ".", porque da nombre a su carpeta. | `REGISTRAR_USUARIO`, `CREAR_FOTOGRAFO`, `EDITAR_FOTOGRAFO`, `CAMBIAR_NOMBRE_INFORMAL`, `CREAR_PORTFOLIO`, `EDITAR_PORTFOLIO`, `RENOMBRAR_PORTFOLIO`, `CREAR_COLECCION`, `EDITAR_COLECCION`, `RENOMBRAR_COLECCION` |

## Operaciones

Lo que se intentaba hacer cuando se incumple una regla. "Importación" es la carga de un catálogo desde un
fichero JSON (`npm run db:importar`); los comandos son tareas de mantenimiento de quien administra la
instalación.

| Código | Descripción | Desde dónde | ¿Puede incumplir reglas? |
|---|---|---|---|
| `INICIAR_SESION` | Iniciar sesión | Web | Sí |
| `CAMBIAR_FOTO_PERFIL` | Cambiar la foto de perfil de "{nombreInformal}" | Web | Sí |
| `REGISTRAR_USUARIO` | Registrar al usuario "{usuario}" | Web | Sí |
| `COMPLETAR_PRIMER_USO` | Completar la configuración inicial de la aplicación | Web | Sí |
| `CAMBIAR_CONTRASENYA_ADMINISTRADOR` | Cambiar la contraseña del administrador | Web | Sí |
| `CREAR_FOTOGRAFO` | Dar de alta al fotógrafo "{nombreInformal}" | Web (administrador) e importación | Sí |
| `CAMBIAR_NOMBRE_INFORMAL` | Cambiar el nombre informal del fotógrafo "{actual}" a "{nuevo}" | Comando `fotografo:renombrar` | Sí |
| `EDITAR_FOTOGRAFO` | Modificar los datos del fotógrafo "{nombreInformal}" | Web | Sí |
| `ELIMINAR_FOTOGRAFO` | Eliminar al fotógrafo "{nombreInformal}" | Web | Sí |
| `CREAR_PORTFOLIO` | Crear el portfolio "{nombre}" del fotógrafo "{fotografo}" | Web e importación | Sí |
| `RENOMBRAR_PORTFOLIO` | Cambiar el nombre del portfolio "{actual}" del fotógrafo "{fotografo}" a "{nuevo}" | Comando `portfolio:renombrar` | Sí |
| `EDITAR_PORTFOLIO` | Modificar el portfolio "{nombre}" del fotógrafo "{fotografo}" | Web | Sí |
| `ORDENAR_PORTFOLIOS` | Cambiar el orden de los portfolios del fotógrafo "{fotografo}" | Web | Sí |
| `CAMBIAR_PORTADA_PORTFOLIO` | Cambiar la colección de portada del portfolio "{portfolio}" del fotógrafo "{fotografo}" | Web | Sí |
| `CAMBIAR_VISIBILIDAD_PORTFOLIO` | Cambiar la visibilidad del portfolio "{portfolio}" del fotógrafo "{fotografo}" | Web | No, hoy ninguna |
| `ELIMINAR_PORTFOLIO` | Eliminar el portfolio "{nombre}" del fotógrafo "{fotografo}" | Web | Sí |
| `CREAR_COLECCION` | Crear la colección "{nombre}" en el portfolio "{portfolio}" del fotógrafo "{fotografo}" | Web e importación | Sí |
| `RENOMBRAR_COLECCION` | Cambiar el nombre dla colección "{actual}" del portfolio "{portfolio}" a "{nuevo}" | Comando `coleccion:renombrar` | Sí |
| `EDITAR_COLECCION` | Modificar la colección "{nombre}" del portfolio "{portfolio}" | Web | Sí |
| `CAMBIAR_PORTADA_COLECCION` | Cambiar la foto de portada de la colección "{coleccion}" del portfolio "{portfolio}" | Web | Sí |
| `CAMBIAR_VISIBILIDAD_COLECCION` | Cambiar la visibilidad de la colección "{coleccion}" del portfolio "{portfolio}" | Web | No, hoy ninguna |
| `ELIMINAR_COLECCION` | Eliminar la colección "{nombre}" del portfolio "{portfolio}" | Web | Sí |
| `ORDENAR_COLECCIONES` | Cambiar el orden de las colecciones del portfolio "{portfolio}" del fotógrafo "{fotografo}" | Web | Sí |
| `ANYADIR_FOTO` | Añadir la foto "{nombreFichero}" a la colección "{coleccion}" del portfolio "{portfolio}" | Web e importación | Sí |
| `ORDENAR_FOTOS` | Cambiar el orden de las fotos de la colección "{coleccion}" del portfolio "{portfolio}" | Web | Sí |
| `CAMBIAR_TITULO_FOTO` | Cambiar el título de la foto "{nombreFichero}" de la colección "{coleccion}" del portfolio "{portfolio}" | Web | Sí |
| `ELIMINAR_FOTO` | Eliminar la foto "{nombreFichero}" de la colección "{coleccion}" del portfolio "{portfolio}" | Web | No, hoy ninguna |

## Lo que no está en el catálogo

Otros rechazos de la aplicación no son reglas de negocio y no tienen código en el catálogo:

- **Permisos.** Modificar algo sin haber iniciado sesión, o algo que es de otro fotógrafo, se rechaza
  antes de comprobar ninguna regla (en `backend/src/routes/autorizacion.ts`).
- **Lo que no existe.** Pedir un fotógrafo, portfolio, colección o foto que no existe, o que está oculto
  para quien lo pide, responde "no encontrado".
- **Peticiones mal formadas.** Un dato del tipo equivocado (un número donde va un texto) se rechaza como
  petición incorrecta, no como regla.
- **Restricciones de la base de datos.** Los valores únicos y obligatorios están también en la base de
  datos, como última defensa. Las reglas se comprueban antes, para dar un mensaje comprensible.

## Cómo se entrega una regla incumplida

- **En la web.** La API responde con el estado 422 y este cuerpo, del que la web muestra la operación y el
  motivo: `{ tipo: "reglaNegocioIncumplida", operacion: { codigo, descripcion }, regla: { codigo, mensaje }, message }`.
- **En los comandos.** Se muestran la operación y la regla en la consola, y no se guarda nada.

## Cómo añadir una regla

1. Darle un código y un mensaje en `backend/src/reglas/catalogo.ts`.
2. Comprobarla en `backend/src/reglas/validaciones.ts`, o junto a la operación si solo tiene sentido allí.
3. Añadir su prueba en `backend/src/reglas/reglas.test.ts`.
4. Añadirla a este documento.
