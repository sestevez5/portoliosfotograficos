// Catálogo de reglas de negocio: todo lo que la aplicación no permite. Es el único sitio donde
// se definen las reglas y se redactan sus mensajes. Los mensajes admiten marcadores {campo}
// que se sustituyen por los datos que acompañan a la regla al incumplirse.
//
// Para añadir una regla: darle aquí un código y un mensaje, y comprobarla donde corresponda
// (normalmente en validaciones.ts) con exigir() o incumplir() (ver regla-incumplida.ts).
//
// Las restricciones UNIQUE/NOT NULL de la base de datos siguen existiendo como última defensa,
// pero las reglas se comprueban antes para dar un mensaje comprensible.

export const REGLAS = {
  // ---------------- Usuarios (la cuenta: usuario, correo y contraseña) ----------------
  USUARIO_OBLIGATORIO: 'El nombre de usuario es obligatorio.',
  USUARIO_NO_VALIDO:
    'El nombre de usuario "{usuario}" no es válido: debe tener entre 3 y 30 caracteres, empezar por una letra o un número y usar solo letras sin tildes, números, ".", "_" o "-".',
  USUARIO_DUPLICADO: 'Ya existe otro usuario con el nombre de usuario "{usuario}".',
  USUARIO_EMAIL_OBLIGATORIO: 'El correo electrónico es obligatorio.',
  USUARIO_CONTRASENYA_OBLIGATORIA: 'La contraseña es obligatoria.',
  USUARIO_EMAIL_DUPLICADO: 'Ya existe otro usuario con el correo electrónico "{email}".',
  USUARIO_EMAIL_NO_VALIDO: 'El correo electrónico "{email}" no tiene un formato válido.',
  USUARIO_CONTRASENYA_CORTA: 'La contraseña debe tener al menos {minimo} caracteres.',
  USUARIO_CREDENCIALES_INCORRECTAS: 'El usuario o la contraseña no son correctos.',
  USUARIO_CONTRASENYA_REPETIDA: 'La contraseña nueva debe ser distinta de la actual.',
  USUARIO_FOTO_NO_VALIDA: 'La foto de perfil debe ser una imagen JPEG de como máximo {maximo} MB.',

  // ---------------- Administrador y primer uso ----------------
  PRIMER_USO_COMPLETADO: 'La aplicación ya está configurada: el primer uso ya se completó.',

  // ---------------- Fotógrafos ----------------
  FOTOGRAFO_NOMBRE_OBLIGATORIO: 'El nombre del fotógrafo es obligatorio.',
  FOTOGRAFO_PRIMER_APELLIDO_OBLIGATORIO: 'El primer apellido del fotógrafo es obligatorio.',
  FOTOGRAFO_NOMBRE_INFORMAL_OBLIGATORIO: 'El nombre informal del fotógrafo es obligatorio.',
  FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO:
    'Ya existe otro fotógrafo con el mismo nombre informal ("{nombreInformal}" coincide con "{otro}").',
  FOTOGRAFO_CARPETA_OCUPADA:
    'Ya existe la carpeta "{carpeta}" en la carpeta de fotos; no se puede usar para el fotógrafo "{nombreInformal}".',
  FOTOGRAFO_NOMBRE_INFORMAL_RESERVADO:
    'El nombre informal "{nombreInformal}" no se puede usar: su dirección coincide con una reservada por la aplicación ("{reservado}").',
  // Se incumple si se intenta eliminar sin confirmar: la web la muestra como pregunta y, si el
  // usuario acepta, repite la petición confirmando.
  FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS:
    'El usuario que intenta eliminar tiene portfolios creados. Si lo elimina, se perderán de forma permanente sus portfolios, colecciones y fotos. ¿Desea continuar?',

  // ---------------- Portfolios ----------------
  PORTFOLIO_NOMBRE_OBLIGATORIO: 'El nombre del portfolio es obligatorio.',
  PORTFOLIO_NOMBRE_DUPLICADO: 'Ya existe otro portfolio con el mismo nombre ("{nombre}") para este fotógrafo.',
  PORTFOLIO_CARPETA_OCUPADA:
    'Ya existe la carpeta "{carpeta}" en la del fotógrafo; no se puede usar para el portfolio "{nombre}".',
  PORTFOLIO_ORDEN_NO_VALIDO:
    'El nuevo orden debe incluir exactamente los portfolios del fotógrafo "{fotografo}", cada uno una sola vez (puede que otra persona lo haya cambiado: recarga la página).',
  // Igual que FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS: la web la muestra como pregunta.
  PORTFOLIO_ELIMINAR_CON_COLECCIONES:
    'Este portfolio contiene colecciones. Si lo elimina, se perderán de forma permanente sus colecciones y fotos. ¿Desea continuar?',

  // ---------------- Colecciones ----------------
  COLECCION_NOMBRE_OBLIGATORIO: 'El nombre dla colección es obligatorio.',
  COLECCION_NOMBRE_DUPLICADO: 'Ya existe otra colección con el mismo nombre ("{nombre}") en este portfolio.',
  COLECCION_CARPETA_OCUPADA:
    'Ya existe la carpeta "{carpeta}" en la del portfolio; no se puede usar para la colección "{nombre}".',
  PORTFOLIO_COLECCION_PORTADA_INEXISTENTE: 'La colección de portada "{coleccionPortada}" no pertenece al portfolio "{portfolio}".',
  COLECCION_FOTO_PORTADA_INEXISTENTE: 'La foto de portada "{fotoPortada}" no pertenece a la colección "{coleccion}".',
  COLECCION_TAG_DUPLICADO: 'La colección "{coleccion}" tiene el tag "{tag}" repetido.',
  COLECCION_ORDEN_NO_VALIDO:
    'El nuevo orden debe incluir exactamente las colecciones del portfolio "{portfolio}", cada una una sola vez (puede que otra persona lo haya cambiado: recarga la página).',
  // Igual que FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS: la web la muestra como pregunta.
  COLECCION_ELIMINAR_CON_FOTOS:
    'Esta colección contiene fotos. Si lo elimina, se perderán de forma permanente sus fotos. ¿Desea continuar?',

  // ---------------- Fotos ----------------
  FOTO_FICHERO_DUPLICADO: 'Ya existe otra foto con el mismo fichero ("{nombreFichero}") en esta colección.',
  FOTO_NOMBRE_FICHERO_NO_VALIDO:
    'El nombre de fichero "{nombreFichero}" no es válido: no puede estar vacío, contener "/" ni "\\", empezar por "." ni tener más de {maximo} caracteres.',
  FOTO_ORDEN_NO_VALIDO:
    'El nuevo orden debe incluir exactamente las fotos de la colección "{coleccion}", cada una una sola vez (puede que otra persona la haya cambiado: recarga la página).',
  FOTO_FORMATO_NO_VALIDO: 'El fichero "{nombreFichero}" no es una imagen JPEG, PNG o WebP de como máximo {maximo} MB.',
  FOTO_TITULO_DEMASIADO_LARGO: 'El título de una foto debe tener menos de {limite} caracteres ("{titulo}" tiene {longitud}).',

  // ---------------- Comunes ----------------
  // El nombre normalizado es también el nombre de la carpeta (ver utils/normalizar-nombre.ts).
  NOMBRE_NO_VALIDO:
    'El nombre "{nombre}" no es válido: no puede contener "/" ni "\\" ni empezar por ".", porque da nombre a su carpeta.',
} as const satisfies Record<string, string>;

export type CodigoRegla = keyof typeof REGLAS;

// Operaciones que pueden incumplir reglas: describen qué se intentaba hacer, para acompañar al
// mensaje de la regla ("No se ha podido crear el portfolio "Viajes"… Ya existe otro portfolio…").
// Se redactan en infinitivo y con marcadores {campo}, igual que las reglas.
export const OPERACIONES = {
  INICIAR_SESION: 'Iniciar sesión',
  CAMBIAR_FOTO_PERFIL: 'Cambiar la foto de perfil de "{nombreInformal}"',
  REGISTRAR_USUARIO: 'Registrar al usuario "{usuario}"',
  COMPLETAR_PRIMER_USO: 'Completar la configuración inicial de la aplicación',
  CAMBIAR_CONTRASENYA_ADMINISTRADOR: 'Cambiar la contraseña del administrador',
  CREAR_FOTOGRAFO: 'Dar de alta al fotógrafo "{nombreInformal}"',
  CAMBIAR_NOMBRE_INFORMAL: 'Cambiar el nombre informal del fotógrafo "{actual}" a "{nuevo}"',
  EDITAR_FOTOGRAFO: 'Modificar los datos del fotógrafo "{nombreInformal}"',
  ELIMINAR_FOTOGRAFO: 'Eliminar al fotógrafo "{nombreInformal}"',
  CREAR_PORTFOLIO: 'Crear el portfolio "{nombre}" del fotógrafo "{fotografo}"',
  RENOMBRAR_PORTFOLIO: 'Cambiar el nombre del portfolio "{actual}" del fotógrafo "{fotografo}" a "{nuevo}"',
  EDITAR_PORTFOLIO: 'Modificar el portfolio "{nombre}" del fotógrafo "{fotografo}"',
  ORDENAR_PORTFOLIOS: 'Cambiar el orden de los portfolios del fotógrafo "{fotografo}"',
  CAMBIAR_PORTADA_PORTFOLIO: 'Cambiar la colección de portada del portfolio "{portfolio}" del fotógrafo "{fotografo}"',
  CAMBIAR_VISIBILIDAD_PORTFOLIO: 'Cambiar la visibilidad del portfolio "{portfolio}" del fotógrafo "{fotografo}"',
  ELIMINAR_PORTFOLIO: 'Eliminar el portfolio "{nombre}" del fotógrafo "{fotografo}"',
  CREAR_COLECCION: 'Crear la colección "{nombre}" en el portfolio "{portfolio}" del fotógrafo "{fotografo}"',
  RENOMBRAR_COLECCION: 'Cambiar el nombre dla colección "{actual}" del portfolio "{portfolio}" a "{nuevo}"',
  EDITAR_COLECCION: 'Modificar la colección "{nombre}" del portfolio "{portfolio}"',
  CAMBIAR_PORTADA_COLECCION: 'Cambiar la foto de portada de la colección "{coleccion}" del portfolio "{portfolio}"',
  CAMBIAR_VISIBILIDAD_COLECCION: 'Cambiar la visibilidad de la colección "{coleccion}" del portfolio "{portfolio}"',
  ELIMINAR_COLECCION: 'Eliminar la colección "{nombre}" del portfolio "{portfolio}"',
  ORDENAR_COLECCIONES: 'Cambiar el orden de las colecciones del portfolio "{portfolio}" del fotógrafo "{fotografo}"',
  ANYADIR_FOTO: 'Añadir la foto "{nombreFichero}" a la colección "{coleccion}" del portfolio "{portfolio}"',
  ORDENAR_FOTOS: 'Cambiar el orden de las fotos de la colección "{coleccion}" del portfolio "{portfolio}"',
  CAMBIAR_TITULO_FOTO: 'Cambiar el título de la foto "{nombreFichero}" de la colección "{coleccion}" del portfolio "{portfolio}"',
  ELIMINAR_FOTO: 'Eliminar la foto "{nombreFichero}" de la colección "{coleccion}" del portfolio "{portfolio}"',
  CONVERTIR_FOTO: 'Convertir a AVIF la foto "{nombreFichero}" de la colección "{coleccion}" del portfolio "{portfolio}"',
} as const satisfies Record<string, string>;

export type CodigoOperacion = keyof typeof OPERACIONES;
