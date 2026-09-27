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
  // ---------------- Fotógrafos ----------------
  FOTOGRAFO_NOMBRE_OBLIGATORIO: 'El nombre del fotógrafo es obligatorio.',
  FOTOGRAFO_PRIMER_APELLIDO_OBLIGATORIO: 'El primer apellido del fotógrafo es obligatorio.',
  FOTOGRAFO_NOMBRE_INFORMAL_OBLIGATORIO: 'El nombre informal del fotógrafo es obligatorio.',
  FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO:
    'Ya existe otro fotógrafo con el mismo nombre informal ("{nombreInformal}" coincide con "{otro}").',
  FOTOGRAFO_CARPETA_OCUPADA:
    'Ya existe la carpeta "{carpeta}" en datos/fotos; no se puede usar para el fotógrafo "{nombreInformal}".',
  FOTOGRAFO_EMAIL_DUPLICADO: 'Ya existe otro fotógrafo con el correo electrónico "{email}".',
  FOTOGRAFO_USUARIO_DUPLICADO: 'Ya existe otro fotógrafo con el usuario "{usuario}".',
  FOTOGRAFO_NOMBRE_INFORMAL_RESERVADO:
    'El nombre informal "{nombreInformal}" no se puede usar: su dirección coincide con una reservada por la aplicación ("{reservado}").',
  FOTOGRAFO_EMAIL_NO_VALIDO: 'El correo electrónico "{email}" no tiene un formato válido.',
  FOTOGRAFO_CONTRASENYA_CORTA: 'La contraseña debe tener al menos {minimo} caracteres.',
  // Se incumple si se intenta eliminar sin confirmar: la web la muestra como pregunta y, si el
  // usuario acepta, repite la petición confirmando.
  FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS:
    'El usuario que intenta eliminar tiene portfolios creados. Si lo elimina, se perderán de forma permanente sus portfolios, álbumes y fotos. ¿Desea continuar?',

  // ---------------- Portfolios ----------------
  PORTFOLIO_NOMBRE_OBLIGATORIO: 'El nombre del portfolio es obligatorio.',
  PORTFOLIO_NOMBRE_DUPLICADO: 'Ya existe otro portfolio con el mismo nombre ("{nombre}") para este fotógrafo.',
  PORTFOLIO_CARPETA_OCUPADA:
    'Ya existe la carpeta "{carpeta}" en la del fotógrafo; no se puede usar para el portfolio "{nombre}".',
  // Igual que FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS: la web la muestra como pregunta.
  PORTFOLIO_ELIMINAR_CON_ALBUMES:
    'Este portfolio contiene álbumes. Si lo elimina, se perderán de forma permanente sus álbumes y fotos. ¿Desea continuar?',

  // ---------------- Álbumes ----------------
  ALBUM_NOMBRE_OBLIGATORIO: 'El nombre del álbum es obligatorio.',
  ALBUM_NOMBRE_DUPLICADO: 'Ya existe otro álbum con el mismo nombre ("{nombre}") en este portfolio.',
  ALBUM_CARPETA_OCUPADA:
    'Ya existe la carpeta "{carpeta}" en la del portfolio; no se puede usar para el álbum "{nombre}".',
  ALBUM_FOTO_PORTADA_INEXISTENTE: 'La foto de portada "{fotoPortada}" no pertenece al álbum "{album}".',
  ALBUM_TAG_DUPLICADO: 'El álbum "{album}" tiene el tag "{tag}" repetido.',
  // Igual que FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS: la web la muestra como pregunta.
  ALBUM_ELIMINAR_CON_FOTOS:
    'Este álbum contiene fotos. Si lo elimina, se perderán de forma permanente sus fotos. ¿Desea continuar?',

  // ---------------- Fotos ----------------
  FOTO_FICHERO_DUPLICADO: 'Ya existe otra foto con el mismo fichero ("{nombreFichero}") en este álbum.',

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
  CREAR_FOTOGRAFO: 'Dar de alta al fotógrafo "{nombreInformal}"',
  CAMBIAR_NOMBRE_INFORMAL: 'Cambiar el nombre informal del fotógrafo "{actual}" a "{nuevo}"',
  EDITAR_FOTOGRAFO: 'Modificar los datos del fotógrafo "{nombreInformal}"',
  ELIMINAR_FOTOGRAFO: 'Eliminar al fotógrafo "{nombreInformal}"',
  CREAR_PORTFOLIO: 'Crear el portfolio "{nombre}" del fotógrafo "{fotografo}"',
  RENOMBRAR_PORTFOLIO: 'Cambiar el nombre del portfolio "{actual}" del fotógrafo "{fotografo}" a "{nuevo}"',
  EDITAR_PORTFOLIO: 'Modificar el portfolio "{nombre}" del fotógrafo "{fotografo}"',
  ELIMINAR_PORTFOLIO: 'Eliminar el portfolio "{nombre}" del fotógrafo "{fotografo}"',
  CREAR_ALBUM: 'Crear el álbum "{nombre}" en el portfolio "{portfolio}" del fotógrafo "{fotografo}"',
  RENOMBRAR_ALBUM: 'Cambiar el nombre del álbum "{actual}" del portfolio "{portfolio}" a "{nuevo}"',
  EDITAR_ALBUM: 'Modificar el álbum "{nombre}" del portfolio "{portfolio}"',
  ELIMINAR_ALBUM: 'Eliminar el álbum "{nombre}" del portfolio "{portfolio}"',
  ANYADIR_FOTO: 'Añadir la foto "{nombreFichero}" al álbum "{album}" del portfolio "{portfolio}"',
} as const satisfies Record<string, string>;

export type CodigoOperacion = keyof typeof OPERACIONES;
