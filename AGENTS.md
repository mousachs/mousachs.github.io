# AGENTS.md

Guía para agentes de IA trabajando en este proyecto.

## Proyecto

MTG Trade es una web estática para gestionar trades de Magic: The Gathering.

- Stack: HTML, CSS y JavaScript vanilla.
- No hay bundler ni framework.
- Persistencia local: `localStorage` del navegador.
- Persistencia cloud opcional: Supabase.
- Hosting objetivo: GitHub Pages en `https://mousachs.github.io/`.

## Estructura principal

- `index.html`: shell HTML, navegación, footer legal y carga de scripts.
- `styles.css`: estilos globales de la aplicación.
- `app.js`: núcleo compartido:
  - estado global `state`
  - rutas hash
  - eventos globales
  - carga de cartas
  - persistencia
  - helpers de cartas, trades, filtros, backup e importación/exportación
- `pages/home.js`: pantalla de inicio, tarjetas de trades y backup.
- `pages/trade.js`: editor/vista de trade.
- `pages/bulks.js`: importación y gestión de personas/bulks.
- `pages/cards.js`: catálogo de cartas.
- `pages/deck.js`: deck privado/local y decks cloud.
- `pages/user.js`: login, perfil y migración de datos locales a nube.
- `supabase-client.js`: cliente Supabase y operaciones cloud.
- `supabase/schema.sql`: esquema completo de referencia para Supabase.
- `supabase/migrations/`: migraciones SQL aplicadas con Supabase CLI.
- `supabase/functions/`: Edge Functions usadas por la app, como el proxy/parser de ManaBox.
- `data/`: JSON locales de cartas y `manifest.json`.
- `assets/`: iconos, fuente y patrón visual.

## Cómo ejecutar en local

La app usa `fetch()` para cargar JSON, así que debe abrirse con servidor local:

```sh
python -m http.server 8000
```

Luego abrir:

```txt
http://localhost:8000
```

## Validación recomendada

No hay suite de tests automatizada. Antes de commitear cambios JS, ejecutar al menos:

```sh
node --check app.js
node --check pages/home.js
node --check pages/trade.js
node --check pages/bulks.js
node --check pages/cards.js
node --check pages/deck.js
node --check pages/user.js
node --check supabase-client.js
```

Si solo se modifica un archivo JS, validar ese archivo y cualquier archivo relacionado.

## Convención de commits

Usar Conventional Commits en todos los commits nuevos:

- `feat: ...` para funcionalidad nueva.
- `fix: ...` para correcciones.
- `docs: ...` para documentación.
- `style: ...` para cambios visuales/CSS sin cambiar comportamiento.
- `refactor: ...` para reorganización sin cambio funcional.
- `chore: ...` para tareas de mantenimiento.

Ejemplos:

```txt
feat: add trade backup import and export
fix: keep removed cards visible in trade bookmarks
docs: add Codex project guide
style: adjust removed card overlay
```

## Reglas de implementación

- Mantener la app sin dependencias externas de build.
- Evitar frameworks o paquetes nuevos salvo que el usuario lo pida explícitamente.
- Mantener cambios pequeños y focalizados.
- La separación actual por páginas es intencional: no volver a meter todo en `app.js`.
- Si se añade UI específica de una pantalla, preferir editar el archivo en `pages/` correspondiente.
- Si se añade lógica compartida, ponerla en `app.js`.
- No romper compatibilidad con datos antiguos en `localStorage`; al añadir campos nuevos, usar helpers `ensure...` o valores por defecto.
- No hardcodear secretos ni tokens.

## Supabase

- No hardcodear tokens, service role keys ni secretos. La app solo debe usar claves públicas apropiadas para navegador.
- Los cambios de base de datos deben añadirse como migraciones en `supabase/migrations/` y, si procede, reflejarse también en `supabase/schema.sql`.
- `supabase/.temp/` es estado local del CLI y no se debe commitear.
- Para enlazar el proyecto en una máquina autenticada:

```sh
supabase.cmd link --project-ref qrxzrbvnahcrtrewxniy
```

- Para aplicar migraciones pendientes al proyecto remoto:

```sh
supabase.cmd db push
```

- En PowerShell, si `supabase` falla por políticas de ejecución, usar `supabase.cmd`.
- Para desplegar la función de importación de bulks desde ManaBox:

```sh
supabase.cmd functions deploy manabox-bulk --project-ref qrxzrbvnahcrtrewxniy
```

- Antes de tocar RLS/policies, comprobar que la operación queda limitada al usuario correcto. Por ejemplo, borrar trades cloud está restringido al creador del trade.

## Persistencia

Claves actuales de `localStorage` definidas en `app.js`:

- `mtg-trade-trades-v2`
- `mtg-trade-bulks-v2`
- `mtg-trade-settings-v1`

Los backups exportan/importan:

- `trades`
- `bulks`
- `settings`

Importar un backup reemplaza los datos locales del navegador actual.

## Bulks

- Los bulks pueden importarse pegando texto/export o mediante URL guardada.
- Los enlaces de ManaBox (`https://manabox.app/decks/...`) se leen mediante la Edge Function `manabox-bulk`, porque el fetch directo desde GitHub Pages queda bloqueado por CORS.
- La función debe validar estrictamente URLs de decks de ManaBox para evitar crear un proxy abierto.

## Trade editor

Estados relevantes por carta:

- Cantidad: `trade.mine` / `trade.theirs`.
- Marca visual/lógica: `trade.marks[side][cardId]` con valores:
  - `priority`
  - `residual`
  - sin marca `""` / ausente
- Fuera del trade sin eliminar del listado: `trade.removed[side][cardId] = true`.
- Orden manual: `trade.order[side]`.

Una carta marcada como `removed` debe seguir visible, pero no contar en totales, balance ni disponibilidad activa.

## Datos y atribución

Los datos e imágenes de cartas proceden de Scryfall y/o sus descargas/API públicas. Mantener la atribución visible en `index.html` y documentada en `README.md`.

La app es un proyecto fan no oficial, no afiliado ni aprobado por Scryfall ni Wizards of the Coast.

## Deploy

El proyecto se publica con GitHub Pages desde la rama `main`, carpeta raíz.

Si se modifican `index.html`, CSS o JS servidos en GitHub Pages, actualizar el parámetro `v=` de los assets en `index.html` para evitar caché del navegador.

Flujo habitual:

```sh
git status
git add .
git commit -m "tipo: mensaje"
git push
```

No crear ramas ni forzar push salvo petición explícita del usuario.
