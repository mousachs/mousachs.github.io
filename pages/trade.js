function renderTradePage(tradeId) {
  let trade = state.trades.find((item) => item.id === tradeId);
  if (!trade) trade = createTrade();
  state.currentTradeId = trade.id;

  app.innerHTML = `
    <section class="stack">
      ${state.tradeEditorOpen ? renderTradeEditor(trade) : ""}

      <div class="trade-layout">
        ${renderTradeColumn("mine", "Mis cartas", trade.mineOwnerId)}
        <div class="trade-center-sticky">
          <div class="trade-title-bar">
            <div>
              <p class="eyebrow">Trade actual</p>
              <h2 id="tradeHeaderName">${escapeHtml(trade.name)}</h2>
            </div>
          </div>
          <aside class="trade-balance" aria-live="polite">${renderBalance()}</aside>
          <aside class="trade-total-panel" aria-live="polite">${renderTradeMarkTotals()}</aside>
          <a class="ghost-button trade-back-button" href="#/">Volver</a>
        </div>
        ${renderTradeColumn("theirs", "Sus cartas", trade.theirOwnerId)}
      </div>
    </section>
  `;
}

function renderTradeEditor(trade) {
  return `
    <div class="panel stack trade-editor-panel">
      <div class="spread">
        <div>
          <p class="eyebrow">Editor de trade</p>
          <h2>${escapeHtml(trade.name)}</h2>
        </div>
      </div>
      <div class="grid three">
        <label>Nombre del trade
          <input data-trade-name value="${escapeHtml(trade.name)}" placeholder="Ej. Trade con Marta" />
        </label>
        <label>Marcador, 3 letras
          <input data-trade-code maxlength="3" value="${escapeHtml(tradeCode(trade))}" placeholder="ABC" />
        </label>
        <label>Yo soy
          <select data-owner-select="mineOwnerId">${ownerOptions(trade.mineOwnerId, "Sin elegir")}</select>
        </label>
        <label>Tradeo con
          <select data-owner-select="theirOwnerId">${ownerOptions(trade.theirOwnerId, "Sin elegir")}</select>
        </label>
      </div>
    </div>
  `;
}

function renderTradeHeader(trade) {
  const header = document.querySelector("#tradeHeaderName");
  if (header) header.textContent = trade.name;
}

function renderTradeColumn(side, title, ownerId) {
  const trade = currentTrade();
  const list = trade ? trade[side] : {};
  return `
    <section class="trade-column">
      <div class="spread">
        <div>
          <p class="eyebrow">${escapeHtml(ownerName(ownerId) || "Sin persona")}</p>
          <h2>${title}</h2>
        </div>
        <button class="ghost-button" type="button" data-action="clear-side" data-side="${side}" title="Vaciar esta columna del trade" aria-label="Vaciar ${title}">Vaciar</button>
      </div>
      ${renderSummary(list, side)}
      <div class="search-box">
        <label>Buscar carta para añadir
          <input type="search" placeholder="Nombre, número, rareza…" autocomplete="off" data-search-side="${side}" />
        </label>
        ${renderAdvancedFilters(side, { compact: true, includeOwner: false })}
        ${renderTradeSortPreset(side)}
        <div class="search-results" id="results-${side}"></div>
      </div>
      <div class="card-list ${state.tradeView === "grid" ? "is-grid" : ""}">${renderSelectedCards(list, side, ownerId)}</div>
    </section>
  `;
}

function renderTradeSortPreset(side) {
  return `<label class="trade-sort-preset">Ordenar cartas
    <select data-trade-sort-preset data-side="${side}">
      <option value="">Aplicar preset…</option>
      <option value="default">Default: prioridad, nombre, descartes</option>
      <option value="name">Nombre</option>
      <option value="manaValue">Mana value</option>
      <option value="manaCost">Coste de maná</option>
      <option value="type">Tipo de carta</option>
      <option value="rarity">Rareza</option>
      <option value="power">Fuerza</option>
      <option value="toughness">Resistencia</option>
      <option value="colorIdentity">Identidad de color</option>
      <option value="quantity">Cantidad en el trade</option>
    </select>
  </label>`;
}

function renderSummary(list, side) {
  const trade = currentTrade();
  const totals = calculateTotals(list, { trade, side });
  const rarityRows = Object.entries(rarityConfig)
    .map(([rarity, config]) => {
      const count = totals.byRarity[rarity] ?? 0;
      return `<div class="summary-pill summary-${rarity}"><span>${renderRarityIcon(rarity)}${config.label} · ${config.points} pto${config.points > 1 ? "s" : ""}</span><strong>${count} carta${count === 1 ? "" : "s"} · ${count * config.points} pts</strong></div>`;
    })
    .join("");

  return `<div class="summary-card"><div class="summary-total"><span>Total</span><strong>${totals.points} pts</strong></div><div class="summary-grid">${rarityRows}</div></div>`;
}

function renderSelectedCards(list, side, ownerId = "") {
  const entries = orderedTradeEntries(list, side);
  if (!entries.length)
    return `<div class="empty-state">Todavía no hay cartas en esta lista.</div>`;

  return entries
    .map(([cardId, quantity]) => {
      const card = getCard(cardId);
      if (!card) return "";
      const rarity = rarityConfig[card.rarity] ?? rarityConfig.common;
      const ownedQty = ownerOwnedCopies(ownerId, card.id);
      const tradeBreakdown = tradeBreakdownForOwner(ownerId, card.id);
      const visibleTradeBreakdown = tradeBreakdown.filter(
        (item) => item.trade.id !== state.currentTradeId,
      );
      const tradedQty = tradeBreakdown.reduce(
        (sum, item) => sum + activeBreakdownQuantity(item),
        0,
      );
      const showTradeCounter = Boolean(ownerId);
      const isOverTraded = showTradeCounter && tradedQty > ownedQty;
      const requestedBreakdown =
        side === "theirs" ? requestedBreakdownInOtherTrades(card.id) : [];
      const isRequestedElsewhere = requestedBreakdown.some(
        (item) => activeBreakdownQuantity(item) > 0,
      );
      const mark = cardMark(side, card.id);
      const removed = cardRemoved(side, card.id);
      return `
      <article class="card-row ${state.tradeView === "grid" ? "is-grid-card" : ""} ${isOverTraded ? "is-over-traded" : ""} ${!isOverTraded && isRequestedElsewhere ? "is-requested-elsewhere" : ""} ${mark ? `has-${mark}-mark` : ""} ${removed ? "is-removed-from-trade" : ""} ${state.settings.dragSort ? "can-drag" : ""}" data-preview-card="${card.id}" data-trade-card data-side="${side}" data-card-id="${card.id}" draggable="${state.settings.dragSort ? "true" : "false"}">
        ${renderImage(card)}
        ${removed ? `<div class="card-remove-overlay" aria-hidden="true">⊘</div>` : ""}
        <div>
          <div class="card-title">${renderTypeIcon(card.typeCategory)}${escapeHtml(card.name)}</div>
          <div class="card-meta">${renderManaCost(card.manaCost)} ${renderRarityIcon(card.rarity)} ${card.setCode} #${card.collectorNumber} · ${rarity.label} · ${rarity.points} pts/u${showTradeCounter ? ` · ${renderTradeStockCounter(tradedQty, ownedQty, isOverTraded)}` : ""}</div>
          ${renderKeywordIcons(card.keywords)}
          ${renderOwners(card.id, ownerId)}
          ${renderCardMarkControls(side, card.id, mark)}
          ${renderCardRemovedControl(side, card.id, removed)}
          ${showTradeCounter ? renderTradeBreakdown(visibleTradeBreakdown) : ""}
          ${requestedBreakdown.length ? renderTradeBreakdown(requestedBreakdown, "requested") : ""}
        </div>
        ${showTradeCounter ? renderTradeStockCounter(tradedQty, ownedQty, isOverTraded, "badge") : ""}
        <div class="qty-controls" aria-label="Cantidad de ${escapeHtml(card.name)}">
          <button type="button" data-action="quantity" data-side="${side}" data-card-id="${card.id}" data-delta="-1" title="Quitar una copia" aria-label="Quitar una copia de ${escapeHtml(card.name)}">−</button>
                    <span class="qty ${quantity <= 1 ? "is-single" : ""}">${quantity}</span>
                    <button type="button" data-action="quantity" data-side="${side}" data-card-id="${card.id}" data-delta="1" title="Añadir una copia" aria-label="Añadir una copia de ${escapeHtml(card.name)}">+</button>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderCardMarkControls(side, cardId, activeMark = "") {
  return `<div class="card-mark-controls" aria-label="Marcar carta">
    <button class="card-mark-button ${activeMark === "priority" ? "is-active" : ""}" type="button" data-action="toggle-card-mark" data-side="${side}" data-card-id="${cardId}" data-mark="priority" title="Marcar como prioritaria" aria-label="Marcar como prioritaria">★</button>
    <button class="card-mark-button residual ${activeMark === "residual" ? "is-active" : ""}" type="button" data-action="toggle-card-mark" data-side="${side}" data-card-id="${cardId}" data-mark="residual" title="Marcar como residual" aria-label="Marcar como residual">◇</button>
  </div>`;
}

function renderCardRemovedControl(side, cardId, removed = false) {
  return `<div class="card-remove-controls" aria-label="Quitar carta del trade">
    <button class="card-remove-button ${removed ? "is-active" : ""}" type="button" data-action="toggle-card-removed" data-side="${side}" data-card-id="${cardId}" title="${removed ? "Volver a contar en el trade" : "Quitar del trade sin eliminar del listado"}" aria-label="${removed ? "Volver a contar en el trade" : "Quitar del trade sin eliminar del listado"}">⊘</button>
  </div>`;
}

function renderTradeMarkTotals() {
  const trade = currentTrade();
  if (!trade) return "";
  const mine = calculateMarkTotals(trade, "mine");
  const theirs = calculateMarkTotals(trade, "theirs");
  const rows = [
    ["total", "Total"],
    ["priority", "Prio"],
    ["unmarked", "Norm"],
    ["residual", "Resi"],
  ];

  return `<p class="eyebrow">Sumas</p><div class="trade-total-grid"><span></span><strong>Mis</strong><strong>Sus</strong>${rows
    .map(
      ([key, label]) =>
        `<span>${label}</span><strong>${mine[key]}</strong><strong>${theirs[key]}</strong>`,
    )
    .join("")}</div>`;
}

function calculateMarkTotals(trade, side) {
  ensureTradeMarks(trade);
  ensureTradeRemoved(trade);
  return Object.entries(trade[side] ?? {}).reduce(
    (totals, [cardId, quantity]) => {
      const card = getCard(cardId);
      if (!card) return totals;
      const rarity = rarityConfig[card.rarity] ?? rarityConfig.common;
      const points = quantity * rarity.points;
      if (trade.removed?.[side]?.[cardId]) return totals;
      const mark = trade.marks[side]?.[cardId] ?? "";
      totals.total += points;
      if (mark === "priority") totals.priority += points;
      else if (mark === "residual") totals.residual += points;
      else totals.unmarked += points;
      return totals;
    },
    { total: 0, priority: 0, unmarked: 0, residual: 0 },
  );
}

function renderBalance() {
  const trade = currentTrade();
  const mine = calculateTradeTotals(trade, "mine").points;
  const theirs = calculateTradeTotals(trade, "theirs").points;
  const difference = mine - theirs;
  const text =
    difference === 0
      ? mine === 0
        ? "Añade cartas para comparar."
        : "Trade equilibrado por puntos."
      : difference > 0
        ? `Tu lista vale ${difference} punto${difference === 1 ? "" : "s"} más.`
        : `La otra lista vale ${Math.abs(difference)} punto${Math.abs(difference) === 1 ? "" : "s"} más.`;
  return `<p class="eyebrow">Balance</p><div class="balance-score">${mine} - ${theirs}</div><div class="muted">${text}</div><div class="trade-toggle-stack"><button class="ios-toggle ${state.tradeView === "grid" ? "is-on" : ""}" type="button" data-action="toggle-trade-view" title="Cambiar entre vista lista y vista captura" aria-label="Cambiar vista de cartas"><span>Captura</span><i aria-hidden="true"></i></button><button class="ios-toggle ${state.settings.hoverPreview ? "is-on" : ""}" type="button" data-action="toggle-setting" data-setting="hoverPreview" title="Activar o desactivar el zoom al pasar por la imagen" aria-label="Activar o desactivar zoom hover"><span>Zoom</span><i aria-hidden="true"></i></button><button class="ios-toggle ${state.settings.dragSort ? "is-on" : ""}" type="button" data-action="toggle-setting" data-setting="dragSort" title="Activar o desactivar el orden manual arrastrando cartas" aria-label="Activar o desactivar orden manual"><span>Orden</span><i aria-hidden="true"></i></button></div>`;
}

function renderSearch(side, rawQuery) {
  const container = document.querySelector(`#results-${side}`);
  if (!container) return;
  const query = rawQuery.trim().toLocaleLowerCase("es");
  const trade = currentTrade();
  const ownerId = side === "mine" ? trade?.mineOwnerId : trade?.theirOwnerId;
  const filters = state.tradeFilters[side];
  const hasFilters = filtersAreActive(filters);
  const hasOwnerList = Boolean(ownerId);
  if (query.length < 2 && !hasFilters && !hasOwnerList) {
    closeResults(side);
    return;
  }

  const ownerInventory = ownerId
    ? (state.bulks.find((bulk) => bulk.id === ownerId)?.cards ?? {})
    : null;
  const matches = filterCards(state.cards, {
    query,
    filters,
    ownerId,
    onlyOwnerCards: Boolean(ownerId),
  });
  const visibleMatches =
    query.length < 2 && hasOwnerList ? matches : matches.slice(0, 20);

  if (!visibleMatches.length) {
    container.innerHTML = `<div class="empty-state">Sin resultados.</div>`;
    container.classList.add("is-open");
    return;
  }

  container.innerHTML = visibleMatches
    .map((card) => {
      const rarity = rarityConfig[card.rarity] ?? rarityConfig.common;
      const ownedQty = ownerInventory
        ? (ownerInventory[card.id] ?? 0)
        : availableCopies(card.id);
      return `
      <button class="result-button" type="button" data-action="add-card" data-side="${side}" data-card-id="${card.id}" data-preview-card="${card.id}" title="Añadir ${escapeHtml(card.name)} al trade" aria-label="Añadir ${escapeHtml(card.name)} al trade">
        ${renderImage(card)}
        <span>
          <strong>${renderTypeIcon(card.typeCategory)}${escapeHtml(card.name)}</strong>
          <span class="result-meta">${renderManaCost(card.manaCost)} ${renderRarityIcon(card.rarity)} ${card.setCode} #${card.collectorNumber} · ${rarity.label} · ${ownedQty} disponible${ownedQty === 1 ? "" : "s"}</span>
          ${renderKeywordIcons(card.keywords)}
          ${renderOwners(card.id)}
        </span>
        <span class="rarity-badge rarity-${card.rarity}">${rarity.label}</span>
      </button>
    `;
    })
    .join("");
  container.classList.add("is-open");
}
