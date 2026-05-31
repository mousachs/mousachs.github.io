# AGENTS.md

Guía para agentes de IA trabajando en este proyecto.

## Proyecto

MTG Trade es una web estática para gestionar trades de Magic: The Gathering.

- Stack: HTML, CSS y JavaScript vanilla.
- No hay bundler ni framework.
- Persistencia: `localStorage` del navegador.
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

Flujo habitual:

```sh
git status
git add .
git commit -m "tipo: mensaje"
git push
```

No crear ramas ni forzar push salvo petición explícita del usuario.
