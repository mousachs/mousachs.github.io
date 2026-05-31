function renderBulksPage() {
  app.innerHTML = `
    <section class="stack">
      <div>
        <p class="eyebrow">Bulks</p>
        <h2>Personas y cartas disponibles</h2>
      </div>
      <div class="notice">Intento importar desde URL de Manabox directamente. Si el navegador bloquea la petición por CORS, pega abajo el listado/export de Manabox; el parser acepta líneas tipo <strong>2 Lightning Bolt</strong>.</div>
      <form class="panel stack" data-bulk-form>
        <div class="grid two">
          <label>Persona / usuario
            <input id="bulkOwner" required placeholder="Ej. mimandangaeslamejor" />
          </label>
          <label>URL de Manabox
            <input id="bulkUrl" type="url" placeholder="https://manabox.app/decks/..." />
          </label>
        </div>
        <label>Listado pegado opcional
          <textarea id="bulkText" placeholder="1 Aberrant Manawurm\n2 Elite Interceptor"></textarea>
        </label>
        <div class="row">
          <button class="button" type="submit" data-action="save-bulk" title="Guardar o actualizar este bulk" aria-label="Guardar bulk">Guardar bulk</button>
          <span class="muted small" id="bulkStatus"></span>
        </div>
      </form>
      <div class="card-grid">
        ${state.bulks.length ? state.bulks.map(renderBulkCard).join("") : `<div class="empty-state">No hay bulks guardados todavía.</div>`}
      </div>
    </section>
  `;
}

function renderBulkCard(bulk) {
  const unique = Object.keys(bulk.cards).length;
  const copies = Object.values(bulk.cards).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  return `
    <article class="item-card stack">
      <div class="spread">
        <div>
          <h3>${escapeHtml(bulk.ownerName)}</h3>
          <p class="muted small">${unique} cartas distintas · ${copies} copias</p>
        </div>
        <button class="danger-button" type="button" data-action="delete-bulk" data-bulk-id="${bulk.id}" title="Eliminar este bulk/persona" aria-label="Eliminar bulk de ${escapeHtml(bulk.ownerName)}">Eliminar</button>
      </div>
      <p class="muted small">${bulk.sourceUrl ? escapeHtml(bulk.sourceUrl) : "Importado desde texto pegado"}</p>
      <p class="muted small">Actualizado: ${formatDate(bulk.updatedAt)}</p>
    </article>
  `;
}

async function saveBulkFromForm() {
  const ownerInput = document.querySelector("#bulkOwner");
  const urlInput = document.querySelector("#bulkUrl");
  const textInput = document.querySelector("#bulkText");
  const status = document.querySelector("#bulkStatus");
  const ownerNameValue = ownerInput.value.trim();
  const sourceUrl = urlInput.value.trim();
  let sourceText = textInput.value.trim();
  const importsFromUrl = !sourceText && Boolean(sourceUrl);

  if (!ownerNameValue) return;
  status.textContent = "Importando…";

  if (importsFromUrl) {
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      sourceText = doc.body.innerText || doc.body.textContent || html;
    } catch (error) {
      console.error(error);
      status.textContent =
        "No se pudo leer la URL desde el navegador. Pega el listado/export de Manabox y vuelve a guardar.";
      return;
    }
  }

  const parsed = parseCardList(sourceText);
  const cards = {};
  const unknown = [];
  parsed.forEach(({ name, quantity }) => {
    const card = findCardByName(name);
    if (!card) {
      unknown.push(name);
      return;
    }
    cards[card.id] = importsFromUrl
      ? Math.max(cards[card.id] ?? 0, quantity)
      : (cards[card.id] ?? 0) + quantity;
  });

  const existing = state.bulks.find(
    (bulk) =>
      bulk.ownerName.toLocaleLowerCase("es") ===
      ownerNameValue.toLocaleLowerCase("es"),
  );
  const bulk = {
    id: existing?.id ?? uid(),
    ownerName: ownerNameValue,
    sourceUrl,
    cards,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.bulks = existing
    ? state.bulks.map((item) => (item.id === existing.id ? bulk : item))
    : [...state.bulks, bulk];
  saveBulks();
  status.textContent = `Guardado: ${Object.keys(cards).length} cartas distintas${unknown.length ? ` · ${unknown.length} sin reconocer` : ""}.`;
  ownerInput.value = "";
  urlInput.value = "";
  textInput.value = unknown.length
    ? `No reconocidas:\n${unknown.join("\n")}`
    : "";
  renderBulksPage();
}
