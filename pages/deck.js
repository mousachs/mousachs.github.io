function renderDeckPage(options = {}) {
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
          <h2>Mis cartas guardadas</h2>
        </div>
        ${unique ? `<button class="danger-button" type="button" data-action="clear-my-deck" title="Vaciar deck" aria-label="Vaciar deck">Vaciar</button>` : ""}
      </div>
      <div class="notice">Importa aquí tu listado completo de Manabox para tener una vista separada de tus cartas. Estos datos se guardan solo en este navegador y también se incluyen en el backup.</div>
      <div class="panel stack">
        <div class="catalog-toolbar deck-toolbar">
          <label>Buscar en Deck
            <input id="deckSearch" value="${escapeHtml(state.deck.query)}" placeholder="Nombre, rareza, número…" />
          </label>
          <div class="muted small">${entries.length} de ${unique} carta${unique === 1 ? "" : "s"} distinta${unique === 1 ? "" : "s"}</div>
        </div>
        ${renderAdvancedFilters("deck", { includeOwner: false })}
      </div>
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
      <div class="card-grid">
        ${entries.length ? entries.map(({ card, quantity }) => renderMyDeckCard(card, quantity)).join("") : `<div class="empty-state">No has guardado cartas en tu mazo todavía.</div>`}
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
