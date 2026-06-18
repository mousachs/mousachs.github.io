function renderDeckPage(options = {}) {
  const cloudMode = isCloudReady();
  const activeDeck = cloudMode
    ? state.cloud.decks.find((deck) => deck.id === state.deck.activeDeckId)
    : null;
  const cards = state.myDeck?.cards ?? {};
  const unique = Object.keys(cards).length;
  const copies = Object.values(cards).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  const deckItems = Object.entries(cards)
    .map(([cardId, quantity]) => ({ card: getCard(cardId), quantity }))
    .filter((item) => item.card);
  const filteredCards = filterCards(
    deckItems.map((item) => item.card),
    {
      query: state.deck.query,
      filters: state.deck.filters,
    },
  );
  const filteredIds = new Set(filteredCards.map((card) => card.id));
  const entries = deckItems
    .filter((item) => filteredIds.has(item.card.id))
    .sort((a, b) => a.card.name.localeCompare(b.card.name, "es"));

  app.innerHTML = `
    <section class="stack">
      <div class="spread">
        <div>
          <p class="eyebrow">Deck</p>
          <h2>${cloudMode ? "Mis decks privados" : "Mis cartas guardadas"}</h2>
        </div>
        <div class="row">
          ${cloudMode ? `<button class="ghost-button" type="button" data-action="refresh-cloud-decks" title="Recargar decks de Supabase" aria-label="Recargar decks">Recargar</button>` : ""}
          ${cloudMode && activeDeck ? `<button class="danger-button" type="button" data-action="delete-cloud-deck" data-deck-id="${activeDeck.id}" title="Eliminar deck seleccionado" aria-label="Eliminar deck ${escapeHtml(activeDeck.name)}">Eliminar deck</button>` : !cloudMode && unique ? `<button class="danger-button" type="button" data-action="clear-my-deck" title="Vaciar deck" aria-label="Vaciar deck">Vaciar</button>` : ""}
        </div>
      </div>
      ${renderDeckModeNotice()}
      ${cloudMode ? renderCloudDeckSelector(activeDeck, unique, copies) : ""}
      <div class="panel stack">
        <div class="catalog-toolbar deck-toolbar">
          <label>Buscar en Deck
            <input id="deckSearch" value="${escapeHtml(state.deck.query)}" placeholder="Nombre, rareza, número…" />
          </label>
          <div class="muted small">${entries.length} de ${unique} carta${unique === 1 ? "" : "s"} distinta${unique === 1 ? "" : "s"}</div>
        </div>
        ${renderAdvancedFilters("deck", { includeOwner: false })}
      </div>
      ${renderDeckForm(activeDeck, unique, copies)}
      <div class="card-grid">
        ${state.cloud.decksLoading ? `<div class="empty-state">Cargando decks…</div>` : entries.length ? entries.map(({ card, quantity }) => renderMyDeckCard(card, quantity)).join("") : `<div class="empty-state">${cloudMode && !activeDeck ? "Selecciona un deck o crea uno nuevo." : "No has guardado cartas en este deck todavía."}</div>`}
      </div>
    </section>
  `;

  if (options.keepSearchFocus) {
    const searchInput = document.querySelector("#deckSearch");
    searchInput?.focus();
    searchInput?.setSelectionRange(
      searchInput.value.length,
      searchInput.value.length,
    );
  }

  if (options.focusFilter) {
    const filterInput = document.querySelector(
      `[data-filter][data-scope='deck'][data-field='${options.focusFilter.field}']`,
    );
    filterInput?.focus();
    if (typeof filterInput?.setSelectionRange === "function") {
      filterInput.setSelectionRange(
        filterInput.value.length,
        filterInput.value.length,
      );
    }
  }
}

function renderDeckModeNotice() {
  if (isCloudReady()) {
    return `<div class="notice">Tus decks se guardan automáticamente en Supabase y son privados por defecto. El deck seleccionado es el que se usa para los marcadores <strong>Deck ×N</strong> y el filtro “No tengo en Deck” en trades.</div>`;
  }
  if (state.cloud.configured && state.cloud.user && !state.cloud.profile) {
    return `<div class="notice">Elige un username en Inicio para poder sincronizar varios decks privados en la nube.</div>`;
  }
  if (state.cloud.configured && !state.cloud.user) {
    return `<div class="notice">Inicia sesión en Inicio para sincronizar varios decks privados. Mientras tanto, esta pantalla usa el deck local del navegador.</div>`;
  }
  return `<div class="notice">Importa aquí tu listado completo de Manabox para tener una vista separada de tus cartas. Estos datos se guardan solo en este navegador y también se incluyen en el backup.</div>`;
}

function renderCloudDeckSelector(activeDeck, unique, copies) {
  return `
    <div class="panel stack">
      <div class="catalog-toolbar deck-toolbar">
        <label>Deck activo
          <select id="cloudDeckSelect">
            <option value="" ${!state.deck.activeDeckId ? "selected" : ""}>Nuevo deck…</option>
            ${state.cloud.decks.map((deck) => `<option value="${deck.id}" ${deck.id === state.deck.activeDeckId ? "selected" : ""}>${escapeHtml(deck.name)}</option>`).join("")}
          </select>
        </label>
        <div class="grid two deck-stats">
          <div class="stat"><span class="muted">Cartas distintas</span><strong>${unique}</strong></div>
          <div class="stat"><span class="muted">Copias totales</span><strong>${copies}</strong></div>
        </div>
      </div>
      <p class="muted small">${activeDeck ? `Actualizado: ${formatDate(activeDeck.updatedAt)} · Visibilidad: ${deckVisibilityLabel(activeDeck.visibility)}` : "Crea un deck nuevo importando una lista."}</p>
    </div>
  `;
}

function renderDeckForm(activeDeck, unique, copies) {
  if (isCloudReady()) {
    return `
      <form class="panel stack" data-my-deck-form>
        <div class="grid three">
          <label>Nombre del deck
            <input id="myDeckName" required value="${escapeHtml(activeDeck?.name ?? "")}" placeholder="Ej. Commander" />
          </label>
          <label>Visibilidad
            <select id="myDeckVisibility">
              <option value="private" ${(activeDeck?.visibility ?? "private") === "private" ? "selected" : ""}>Privado</option>
              <option value="unlisted" ${activeDeck?.visibility === "unlisted" ? "selected" : ""}>No listado</option>
              <option value="public" ${activeDeck?.visibility === "public" ? "selected" : ""}>Público</option>
            </select>
            <span class="muted small">Privado por defecto. No listado/público se usará para compartir cuando esté activado.</span>
          </label>
          <label>URL de Manabox
            <input id="myDeckUrl" type="url" value="${escapeHtml(activeDeck?.sourceUrl ?? "")}" placeholder="https://manabox.app/decks/..." />
          </label>
        </div>
        <label>Listado pegado opcional
          <textarea id="myDeckText" placeholder="1 Lightning Bolt\n2 Elite Interceptor"></textarea>
        </label>
        <div class="row">
          <button class="button" type="submit" data-action="save-my-deck" title="Guardar deck" aria-label="Guardar deck">${activeDeck ? "Actualizar deck" : "Crear deck"}</button>
          <span class="muted small" id="myDeckStatus">${activeDeck?.updatedAt ? `Actualizado: ${formatDate(activeDeck.updatedAt)}` : ""}</span>
        </div>
      </form>
    `;
  }

  return `
    <form class="panel stack" data-my-deck-form>
      <div class="grid two">
        <label>URL de Manabox
          <input id="myDeckUrl" type="url" value="${escapeHtml(state.myDeck?.sourceUrl ?? "")}" placeholder="https://manabox.app/decks/..." />
        </label>
        <div class="grid two deck-stats">
          <div class="stat"><span class="muted">Cartas distintas</span><strong>${unique}</strong></div>
          <div class="stat"><span class="muted">Copias totales</span><strong>${copies}</strong></div>
        </div>
      </div>
      <label>Listado pegado opcional
        <textarea id="myDeckText" placeholder="1 Lightning Bolt\n2 Elite Interceptor"></textarea>
      </label>
      <div class="row">
        <button class="button" type="submit" data-action="save-my-deck" title="Guardar deck" aria-label="Guardar deck">Guardar deck</button>
        <span class="muted small" id="myDeckStatus">${state.myDeck?.updatedAt ? `Actualizado: ${formatDate(state.myDeck.updatedAt)}` : ""}</span>
      </div>
    </form>
  `;
}

function deckVisibilityLabel(visibility) {
  return (
    {
      private: "Privado",
      unlisted: "No listado",
      public: "Público",
    }[visibility] ?? "Privado"
  );
}

function renderMyDeckCard(card, quantity) {
  const rarity = rarityConfig[card.rarity] ?? rarityConfig.common;
  return `
    <article class="item-card catalog-card" data-preview-card="${card.id}">
      ${renderImage(card)}
      <div>
        <div class="spread">
          <div>
            <div class="card-title">${renderTypeIcon(card.typeCategory)}${escapeHtml(card.name)}</div>
            <div class="card-meta">${renderManaCost(card.manaCost)} ${renderRarityIcon(card.rarity)} ${card.setCode} #${card.collectorNumber} · ${rarity.label}</div>
            <div class="card-meta">${escapeHtml(card.typeLine)}${card.creatureTypes.length ? ` · ${escapeHtml(card.creatureTypes.join(", "))}` : ""}</div>
            ${renderKeywordIcons(card.keywords)}
          </div>
          <span class="rarity-badge rarity-${card.rarity}">${quantity}</span>
        </div>
      </div>
    </article>
  `;
}

async function saveMyDeckFromForm() {
  const urlInput = document.querySelector("#myDeckUrl");
  const textInput = document.querySelector("#myDeckText");
  const status = document.querySelector("#myDeckStatus");
  const sourceUrl = urlInput.value.trim();
  let sourceText = textInput.value.trim();
  const importsFromUrl = !sourceText && Boolean(sourceUrl);

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

  const { cards, unknown } = parseDeckCards(sourceText, importsFromUrl);

  if (isCloudReady()) {
    await saveCloudDeck({
      cards,
      unknown,
      sourceUrl,
      textInput,
      status,
    });
    return;
  }

  saveLocalDeck({ cards, unknown, sourceUrl, textInput });
}

function parseDeckCards(sourceText, importsFromUrl) {
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

async function saveCloudDeck({ cards, unknown, sourceUrl, textInput, status }) {
  const nameInput = document.querySelector("#myDeckName");
  const visibilityInput = document.querySelector("#myDeckVisibility");
  const name = nameInput.value.trim();
  const visibility = visibilityInput?.value ?? "private";
  const activeDeck = state.cloud.decks.find(
    (deck) => deck.id === state.deck.activeDeckId,
  );
  const existingByName = state.cloud.decks.find(
    (deck) =>
      deck.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"),
  );

  if (!name) {
    status.textContent = "Pon un nombre al deck.";
    return;
  }

  try {
    const deckId = await window.mtgCloud.saveDeck({
      id: activeDeck?.id ?? existingByName?.id,
      ownerId: state.cloud.user.id,
      name,
      visibility,
      sourceUrl,
      cards,
    });
    await loadCloudDecks(deckId);
    showToast(
      `Deck guardado: ${Object.keys(cards).length} cartas distintas${unknown.length ? ` · ${unknown.length} sin reconocer` : ""}.`,
    );
    textInput.value = unknown.length
      ? `No reconocidas:\n${unknown.join("\n")}`
      : "";
    renderDeckPage();
  } catch (error) {
    console.error(error);
    status.textContent =
      error.message || "No se pudo guardar el deck en la nube.";
  }
}

function saveLocalDeck({ cards, unknown, sourceUrl, textInput }) {
  state.myDeck = {
    cards,
    sourceUrl,
    updatedAt: new Date().toISOString(),
  };
  saveMyDeck();
  textInput.value = unknown.length
    ? `No reconocidas:\n${unknown.join("\n")}`
    : "";
  renderDeckPage();
}

async function deleteCloudDeck(deckId) {
  if (!isCloudReady() || !deckId) return;
  const deck = state.cloud.decks.find((item) => item.id === deckId);
  if (!deck) return;
  if (!confirm(`¿Eliminar el deck "${deck.name}"?`)) return;

  try {
    await window.mtgCloud.deleteDeck(deckId);
    await loadCloudDecks("");
    showToast("Deck eliminado.");
    renderDeckPage();
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo eliminar el deck.");
  }
}
