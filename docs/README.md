# Documentación

Catálogo de documentos sobre la aplicación, en Markdown y organizado en dos secciones. Los genera y
mantiene el agente `documentador` (`.claude/agents/documentador.md`).

Todo el catálogo se puede leer en una sola página: [documentacion.html](documentacion.html), con la
versión de la aplicación en la cabecera y un menú con las dos secciones. Se genera a partir de los
documentos Markdown y hay que regenerarla cada vez que se crea o cambia uno:

```
node docs/generar-html.mjs
```

## Documentación técnica (`tecnica/`)

Cómo está hecha la aplicación y cómo se mantiene.

- [Instalación en un NAS UGREEN](tecnica/instalacion-nas-ugreen.md) — instalar (con la interfaz de la aplicación Docker o por SSH), actualizar, hacer copias y mantener la aplicación en un NAS UGREEN con UGOS Pro y Docker. Para quien administra el NAS.

## Documentación funcional (`funcional/`)

Qué hace la aplicación y con qué condiciones.

- [Casos de uso](funcional/casos-de-uso.md) — todo lo que un usuario puede hacer hoy en la aplicación y con qué condiciones. Para quien necesita saber qué hace la aplicación sin leer el código.
- [Manual de usuario](funcional/manual-de-usuario.md) — cómo se hace, paso a paso, cada gestión de la aplicación: ver el catálogo, la cuenta y la sesión, los portfolios, las colecciones y las fotos, y la administración. Para quien usa la aplicación: visitantes, fotógrafos y el administrador.
- [Manual del fotógrafo](funcional/manual-del-fotografo.md) — el manual de usuario sin las gestiones del administrador: ver el catálogo, la cuenta y la sesión, sus datos, y sus portfolios, colecciones y fotos. Para fotógrafos. También en su propia página: [manual-del-fotografo.html](manual-del-fotografo.html).
- [Reglas de negocio](funcional/reglas-de-negocio.md) — catálogo de todo lo que la aplicación no permite: código, qué exige, mensaje y operaciones en las que se comprueba cada regla. Para quien necesita conocer las restricciones y para quien las mantiene.
