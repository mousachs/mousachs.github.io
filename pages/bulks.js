function renderBulksPage() {
  const cloudMode = isCloudReady();
  const title = cloudMode
    ? "Bulks públicos y propios"
    : "Personas y cartas disponibles";
  app.innerHTML = `
    <section class="stack">
      <div class="spread">
        <div>
          <p class="eyebrow">Bulks</p>
          <h2>${title}</h2>
        </div>
        ${cloudMode ? `<button class="ghost-button" type="button" data-action="refresh-cloud-bulks" title="Recargar bulks de Supabase" aria-label="Recargar bulks">Recargar</button>` : ""}
      </div>
      ${renderBulkModeNotice()}
      ${renderBulkForm()}
      <div class="card-grid">
        ${state.cloud.bulksLoading ? `<div class="empty-state">Cargando bulks…</div>` : state.bulks.length ? state.bulks.map(renderBulkCard).join("") : `<div class="empty-state">No hay bulks guardados todavía.</div>`}
      </div>
    </section>
  `;
}

function renderBulkModeNotice() {
  if (isCloudReady()) {
    return `<div class="notice">Los bulks se guardan en Supabase. Los públicos los ven usuarios logueados; los privados solo tú. Los trades activos no descuentan disponibilidad automáticamente.</div>`;
  }
  if (state.cloud.configured && state.cloud.user && !state.cloud.profile) {
    return `<div class="notice">Elige un username en Inicio para poder publicar y consultar bulks en la nube.</div>`;
  }
  if (state.cloud.configured && !state.cloud.user) {
    return `<div class="notice">Inicia sesión en Inicio para ver bulks públicos de otros usuarios. Mientras tanto, esta pantalla usa los bulks locales del navegador.</div>`;
  }
  return `<div class="notice">Modo local: los bulks se guardan solo en este navegador. Configura Supabase e inicia sesión para publicar bulks.</div>`;
}

function renderBulkForm() {
  if (isCloudReady()) {
    return `
      <form class="panel stack" data-bulk-form>
        <div class="grid three">
          <label>Nombre del bulk
            <input id="bulkName" required placeholder="Ej. Raras Avatar" />
          </label>
          <label>Visibilidad
            <select id="bulkVisibility">
              <option value="public">Público para usuarios logueados</option>
              <option value="private">Privado</option>
              <option value="unlisted">No listado</option>
            </select>
          </label>
          <label>URL de Manabox
            <input id="bulkUrl" type="url" placeholder="https://manabox.app/decks/..." />
          </label>
        </div>
        <label>Listado pegado opcional
          <textarea id="bulkText" placeholder="1 Aberrant Manawurm\n2 Elite Interceptor"></textarea>
        </label>
        <div class="row">
          <button class="button" type="submit" data-action="save-bulk" title="Guardar o actualizar este bulk" aria-label="Guardar bulk">Guardar bulk en nube</button>
          <span class="muted small" id="bulkStatus"></span>
        </div>
      </form>
    `;
  }

  return `
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
        <button class="button" type="submit" data-action="save-bulk" title="Guardar o actualizar este bulk" aria-label="Guardar bulk">Guardar bulk local</button>
        <span class="muted small" id="bulkStatus"></span>
      </div>
    </form>
  `;
}

function renderBulkCard(bulk) {
  const unique = Object.keys(bulk.cards).length;
  const copies = Object.values(bulk.cards).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  const isCloudBulk = bulk.source === "cloud";
  const title = isCloudBulk ? bulk.bulkName : bulk.ownerName;
  const subtitle = isCloudBulk
    ? `@${bulk.profileUsername}${bulk.profileDisplayName && bulk.profileDisplayName !== bulk.profileUsername ? ` · ${escapeHtml(bulk.profileDisplayName)}` : ""}`
    : "Bulk local";
  const visibilityLabel =
    {
      public: "Público",
      private: "Privado",
      unlisted: "No listado",
    }[bulk.visibility] ?? "Local";
  const canDelete = !isCloudBulk || bulk.canEdit;
  return `
    <article class="item-card stack">
      <div class="spread">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p class="muted small">${subtitle} · ${visibilityLabel} · ${unique} cartas distintas · ${copies} copias</p>
        </div>
        ${canDelete ? `<button class="danger-button" type="button" data-action="delete-bulk" data-bulk-id="${bulk.id}" title="Eliminar este bulk" aria-label="Eliminar bulk ${escapeHtml(title)}">Eliminar</button>` : ""}
      </div>
      <p class="muted small">${bulk.sourceUrl ? escapeHtml(bulk.sourceUrl) : "Importado desde texto pegado"}</p>
      <p class="muted small">Actualizado: ${formatDate(bulk.updatedAt)}</p>
    </article>
  `;
}

async function saveBulkFromForm() {
  const urlInput = document.querySelector("#bulkUrl");
  const textInput = document.querySelector("#bulkText");
  const status = document.querySelector("#bulkStatus");
  const sourceUrl = urlInput.value.trim();
  let sourceText = textInput.value.trim();
  const importsFromUrl = !sourceText && Boolean(sourceUrl);

  const nameInput = document.querySelector(
    isCloudReady() ? "#bulkName" : "#bulkOwner",
  );
  const nameValue = nameInput.value.trim();
  const visibility =
    document.querySelector("#bulkVisibility")?.value ?? "public";

  if (!nameValue) return;
  if (!sourceText && !sourceUrl) {
    status.textContent = "Pega un listado o indica una URL de Manabox.";
    return;
  }
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

  const { cards, unknown } = parseBulkCards(sourceText, importsFromUrl);

  if (isCloudReady()) {
    await saveCloudBulk({
      name: nameValue,
      sourceUrl,
      visibility,
      cards,
      unknown,
      nameInput,
      urlInput,
      textInput,
      status,
    });
    return;
  }

  saveLocalBulk({
    ownerName: nameValue,
    sourceUrl,
    cards,
    unknown,
    nameInput,
    urlInput,
    textInput,
    status,
  });
}

function parseBulkCards(sourceText, importsFromUrl) {
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
  return { cards, unknown };
}

async function saveCloudBulk({
  name,
  sourceUrl,
  visibility,
  cards,
  unknown,
  nameInput,
  urlInput,
  textInput,
  status,
}) {
  const existing = state.bulks.find(
    (bulk) =>
      bulk.canEdit &&
      bulk.bulkName?.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"),
  );

  try {
    await window.mtgCloud.saveBulk({
      id: existing?.id,
      ownerId: state.cloud.user.id,
      name,
      sourceUrl,
      visibility,
      cards,
    });
    await loadCloudBulks();
    showToast(
      `Bulk guardado: ${Object.keys(cards).length} cartas distintas${unknown.length ? ` · ${unknown.length} sin reconocer` : ""}.`,
    );
    nameInput.value = "";
    urlInput.value = "";
    textInput.value = unknown.length
      ? `No reconocidas:\n${unknown.join("\n")}`
      : "";
    renderBulksPage();
  } catch (error) {
    console.error(error);
    status.textContent =
      error.message || "No se pudo guardar el bulk en la nube.";
  }
}

function saveLocalBulk({
  ownerName,
  sourceUrl,
  cards,
  unknown,
  nameInput,
  urlInput,
  textInput,
  status,
}) {
  const existing = state.bulks.find(
    (bulk) =>
      bulk.ownerName.toLocaleLowerCase("es") ===
      ownerName.toLocaleLowerCase("es"),
  );
  const bulk = {
    id: existing?.id ?? uid(),
    ownerName,
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
  nameInput.value = "";
  urlInput.value = "";
  textInput.value = unknown.length
    ? `No reconocidas:\n${unknown.join("\n")}`
    : "";
  renderBulksPage();
}

async function deleteBulk(bulkId) {
  const bulk = state.bulks.find((item) => item.id === bulkId);
  if (!bulk) return;

  if (isCloudReady() && bulk.source === "cloud") {
    if (!bulk.canEdit) return;
    try {
      await window.mtgCloud.deleteBulk(bulkId);
      await loadCloudBulks();
      showToast("Bulk eliminado.");
      renderBulksPage();
    } catch (error) {
      console.error(error);
      showToast(error.message || "No se pudo eliminar el bulk.");
    }
    return;
  }

  state.bulks = state.bulks.filter((item) => item.id !== bulkId);
  saveBulks();
  renderBulksPage();
}
