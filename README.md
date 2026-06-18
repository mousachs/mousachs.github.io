# MTG Trade

Web estática en HTML, CSS y JavaScript vanilla para montar trades de Magic y comparar su valor por rareza.

## Ejecutar en local

Como la app carga JSON con `fetch`, abre la carpeta con un servidor local:

```bash
python -m http.server 8000
```

Después entra en <http://localhost:8000>.

## Pantallas

- **Trades** (`#/`): página de inicio con todos los trades guardados. Permite crear, abrir y eliminar trades.
- **Editor de trade** (`#/trade/...`): dos listas, nombre editable del trade, selector de quién eres tú y con quién tradeas, buscadores con filtros avanzados y resumen de puntos. Si eliges una persona, el buscador de su lado solo muestra cartas disponibles de esa persona.
- **Bulks** (`#/bulks`): guarda listas de cartas por persona/usuario desde una URL de Manabox o desde texto pegado.
- **Cartas** (`#/cards`): catálogo completo paginado con 10, 25, 50, 100 o `all`, cantidad disponible total y cartas no disponibles marcadas como deshabilitadas. Incluye filtros avanzados por persona, color, identidad de color, set, texto, tipo, rareza, coste, mana value, fuerza, resistencia y lealtad. En color e identidad puedes usar “Como mucho estos” para buscar cartas cuyos colores sean un subconjunto de los marcados, permitiendo incoloras. También permite ordenar por nombre, coste/mana value, tipo, tipo de criatura y rareza, y agrupar por color, tipo, tipo de criatura, rareza o persona. Incluye filtros rápidos de colegios de Strixhaven: Lorehold, Prismari, Quandrix, Silverquill y Witherbloom.

## Persistencia

La app sigue funcionando sin login usando `localStorage` del navegador:

- Trades: se guardan automáticamente al cambiar el nombre, añadir, quitar o vaciar cartas.
- Bulks/personas: se guardan al importar o actualizar una persona.
- Deck: se guarda localmente y se incluye en los backups.

También hay integración con Supabase para autenticación, perfil público, bulks cloud, decks cloud y trades cloud.

## Supabase

Para activar la nube:

1. Ejecuta `supabase/schema.sql` en el SQL Editor de Supabase.
2. En Supabase, activa `Authentication → Providers → Email` para usar magic links.
3. En `Authentication → URL Configuration`, añade las URLs permitidas, por ejemplo:
   - `http://localhost:3000/**`
   - `http://localhost:8000/**`
   - `https://mousachs.github.io/**`
4. En `Project Settings → API`, copia:
   - `Project URL`
   - `anon public key`
5. Rellena `supabase-config.js`:

```js
window.MTG_SUPABASE_CONFIG = {
  url: "https://tu-proyecto.supabase.co",
  anonKey: "tu-anon-public-key",
};
```

No uses nunca la `service_role key` en el frontend.

## Migrar datos locales a Supabase

Con sesión iniciada, Inicio muestra un panel si detecta datos en `localStorage` del navegador. La acción **Migrar datos locales a nube** copia esos datos a Supabase sin borrar el almacenamiento local:

- Los trades locales se crean como trades cloud solo tuyos.
- El deck local se crea como un deck cloud privado llamado `Deck local importado`.
- Los bulks locales se crean como bulks cloud privados para evitar publicar listas antiguas por accidente.
- Repetir la migración puede duplicar datos.

## Bulks cloud

Con sesión iniciada y username creado, `#/bulks` usa Supabase:

- Los bulks `public` son visibles para usuarios logueados.
- Los bulks `private` solo los ve su propietario.
- Los bulks `unlisted` quedan preparados para compartir por enlace más adelante.
- Cada usuario puede tener varios bulks.
- El catálogo `#/cards` usa los bulks cargados para buscar por carta y por usuario/bulk.
- Los trades activos no descuentan cantidades automáticamente.

Sin sesión, `#/bulks` mantiene el modo local con `localStorage`.

## Decks cloud

Con sesión iniciada y username creado, `#/deck` usa Supabase:

- Cada usuario puede tener varios decks.
- Los decks son privados por defecto.
- El deck seleccionado es el que se usa para los marcadores `Deck ×N` en trades y el filtro “No tengo en Deck”.
- La visibilidad `unlisted/public` queda preparada para compartir por URL más adelante.
- Al cerrar sesión, la app vuelve al deck local guardado en `localStorage`.

Sin sesión, `#/deck` mantiene el modo local con un único deck incluido en backups.

## Trades cloud

Con sesión iniciada y username creado, los nuevos trades se guardan en Supabase:

- El creador puede vincular otro usuario por `username`.
- Solo los participantes pueden ver el trade.
- La vista cambia según quién abre el trade: `Mis cartas` es siempre el lado del usuario actual.
- Ambos participantes pueden modificar ambos lados mientras el trade está desbloqueado.
- Si cualquier participante acepta, el trade queda bloqueado.
- `Solicitar cambios` limpia las aceptaciones y vuelve a permitir edición.
- Si no hay sesión, los trades siguen siendo locales en `localStorage`.

Limitación actual: los trades cloud no se eliminan/abandonan desde la UI todavía; se mantiene el historial para los participantes.

## Importar desde Manabox

En `#/bulks` puedes introducir una URL como:

```text
https://manabox.app/decks/AZ3onNrqeje8oWFPl7k3ew
```

La app intenta leerla directamente desde el navegador. Si Manabox bloquea la petición por CORS, pega el listado/export de Manabox en el textarea. El parser acepta líneas tipo:

```text
1 Aberrant Manawurm
2 Elite Interceptor
```

## Créditos y atribución

Los datos e imágenes de cartas de Magic: The Gathering utilizados por esta app proceden de [Scryfall](https://scryfall.com/) y/o de sus descargas/API públicas.

Esta aplicación no está afiliada, respaldada, patrocinada ni aprobada por Scryfall ni por Wizards of the Coast.

Magic: The Gathering, sus nombres, textos, símbolos, imágenes de cartas y demás materiales relacionados son propiedad de Wizards of the Coast LLC. Esta app es un proyecto fan no oficial y sin ánimo de lucro para gestionar trades personales.

Scryfall proporciona datos e imágenes de cartas como recurso para la comunidad. Más información:

- [Scryfall](https://scryfall.com/)
- [Scryfall API](https://scryfall.com/docs/api)

## Iconos e imágenes

- Los símbolos de maná se descargan como SVG desde Scryfall en `assets/icons/`.
- Si un coste tiene símbolos repetidos del mismo color, se muestra el símbolo una vez con contador en vez de repetir iconos. El maná genérico se muestra como número.
- La app incluye iconos SVG locales para tipo de carta, rareza y keywords habituales como flying, haste, hexproof, vigilance y trample.
- La CSS intenta usar `Beleren` mediante `local("Beleren")` o `assets/fonts/Beleren.woff2`; si no está disponible, usa una fuente serif de fallback.
- Las imágenes de cartas se muestran más grandes en listas, resultados y catálogo.

## Datos de cartas

La app carga los sets definidos en `data/manifest.json`.

JSON descargados desde Scryfall:

- `data/sos.json`: set `SOS`, cargado.
- `data/soa.json`: set `SOA`, cargado.
- `data/soc.json`: set `SOC`, descargado pero quitado temporalmente de `data/manifest.json`.

Para añadir otro set en el futuro:

1. Descarga un nuevo JSON de Scryfall en `data/otro-set.json`.
2. Añádelo a `data/manifest.json`:

```json
{
  "name": "Nombre del set",
  "code": "CODIGO",
  "file": "data/otro-set.json"
}
```

## Puntuación

- Normal / common: 1 punto
- Plateada / uncommon: 2 puntos
- Dorada / rare: 4 puntos
- Mítica / mythic: 8 puntos
