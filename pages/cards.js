function renderCardsPage(options = {}) {
  const query = state.catalog.query.trim().toLocaleLowerCase("es");
  const ownerId = state.catalog.filters.ownerId;
  const filtered = sortCards(
    filterCatalogWishlist(
      filterCards(state.cards, {
        query,
        filters: state.catalog.filters,
        ownerId,
        onlyOwnerCards: Boolean(ownerId),
      }),
    ),
    state.catalog.sortBy,
    state.catalog.sortDir,
    ownerId,
  );
  const pageSize = state.catalog.pageSize;
  const mobileColumns = catalogMobileColumnCount();
  const totalPages =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  if (state.catalog.page > totalPages) state.catalog.page = totalPages;
  const start = pageSize === "all" ? 0 : (state.catalog.page - 1) * pageSize;
  const visible =
    pageSize === "all" ? filtered : filtered.slice(start, start + pageSize);

  app.innerHTML = `
    <section class="stack">
      <div>
        <p class="eyebrow">Catálogo</p>
        <h2>Todas las cartas</h2>
      </div>
      <div class="panel">
        <div class="catalog-toolbar">
          <label class="catalog-search-control">Buscar
            <input id="catalogSearch" value="${escapeHtml(state.catalog.query)}" placeholder="Nombre, rareza, número…" />
          </label>
          <button class="ghost-button catalog-controls-toggle" type="button" data-action="toggle-catalog-controls" aria-expanded="${state.catalog.mobileControlsOpen ? "true" : "false"}" aria-controls="catalogToolbarControls">
            ${state.catalog.mobileControlsOpen ? "Ocultar opciones" : "Opciones"}
          </button>
          <div id="catalogToolbarControls" class="catalog-toolbar-controls ${state.catalog.mobileControlsOpen ? "is-open" : ""}">
            <label>Por página
              <select id="pageSize">
                ${[10, 25, 50, 100].map((size) => `<option value="${size}" ${pageSize === size ? "selected" : ""}>${size}</option>`).join("")}
                <option value="all" ${pageSize === "all" ? "selected" : ""}>all</option>
              </select>
            </label>
            <label>Ordenar por
              <select id="sortBy">
                <option value="name" ${state.catalog.sortBy === "name" ? "selected" : ""}>Nombre</option>
                <option value="manaValue" ${state.catalog.sortBy === "manaValue" ? "selected" : ""}>Coste / mana value</option>
                <option value="type" ${state.catalog.sortBy === "type" ? "selected" : ""}>Tipo</option>
                <option value="creatureType" ${state.catalog.sortBy === "creatureType" ? "selected" : ""}>Tipo de criatura</option>
                <option value="rarity" ${state.catalog.sortBy === "rarity" ? "selected" : ""}>Rareza</option>
                <option value="quantity" ${state.catalog.sortBy === "quantity" ? "selected" : ""}>Cantidad</option>
              </select>
            </label>
            <label>Dirección
              <select id="sortDir">
                <option value="asc" ${state.catalog.sortDir === "asc" ? "selected" : ""}>Ascendente</option>
                <option value="desc" ${state.catalog.sortDir === "desc" ? "selected" : ""}>Descendente</option>
              </select>
            </label>
            <label>Agrupar por
              <select id="groupBy">
                <option value="none" ${state.catalog.groupBy === "none" ? "selected" : ""}>Sin agrupar</option>
                <option value="color" ${state.catalog.groupBy === "color" ? "selected" : ""}>Color</option>
                <option value="type" ${state.catalog.groupBy === "type" ? "selected" : ""}>Tipo</option>
                <option value="creatureType" ${state.catalog.groupBy === "creatureType" ? "selected" : ""}>Tipo de criatura</option>
                <option value="rarity" ${state.catalog.groupBy === "rarity" ? "selected" : ""}>Rareza</option>
                <option value="owner" ${state.catalog.groupBy === "owner" ? "selected" : ""}>Persona</option>
              </select>
            </label>
            <label>Wishlist
              <select id="wishlistCatalogFilter">
                <option value="all" ${state.catalog.wishlistFilter === "all" ? "selected" : ""}>Todas</option>
                <option value="wishlist" ${state.catalog.wishlistFilter === "wishlist" ? "selected" : ""}>Solo wishlist</option>
                <option value="available" ${state.catalog.wishlistFilter === "available" ? "selected" : ""}>Wishlist con stock</option>
                <option value="missing" ${state.catalog.wishlistFilter === "missing" ? "selected" : ""}>Wishlist sin dueño</option>
              </select>
            </label>
            <label class="mobile-columns-control">Cartas por fila
              <select id="catalogMobileColumns">
                ${[1, 2, 3, 4].map((count) => `<option value="${count}" ${mobileColumns === count ? "selected" : ""}>${count}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="muted small catalog-results-count">${filtered.length} resultado${filtered.length === 1 ? "" : "s"}</div>
        </div>
        ${renderAdvancedFilters("catalog")}
        ${renderGroupedCatalog(visible, state.catalog.groupBy, ownerId)}
        ${renderPagination(totalPages)}
      </div>
    </section>
  `;

  if (options.keepSearchFocus) {
    const searchInput = document.querySelector("#catalogSearch");
    searchInput?.focus();
    searchInput?.setSelectionRange(
      searchInput.value.length,
      searchInput.value.length,
    );
  }

  renderFilterPortal(
    options.focusFilter
      ? { scope: "catalog", field: options.focusFilter.field }
      : null,
  );
  renderWishlistPortal();
}

function filterCatalogWishlist(cards) {
  const mode = state.catalog.wishlistFilter ?? "all";
  if (mode === "all") return cards;
  return cards.filter((card) => {
    if (!isWishlisted(card.id)) return false;
    const hasStock = availableCopies(card.id) > 0;
    if (mode === "available") return hasStock;
    if (mode === "missing") return !hasStock;
    return true;
  });
}

function renderGroupedCatalog(cards, groupBy, ownerId = "") {
  const gridAttributes = catalogGridAttributes();
  if (!cards.length)
    return `<div ${gridAttributes}><div class="empty-state">Sin cartas.</div></div>`;
  if (groupBy === "none") {
    return `<div ${gridAttributes}>${cards.map((card) => renderCatalogCard(card, ownerId)).join("")}</div>`;
  }

  const groups = new Map();
  cards.forEach((card) => {
    const key = groupLabel(card, groupBy, ownerId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  });

  return [...groups.entries()]
    .map(
      ([label, groupedCards]) => `
    <section class="catalog-group">
      <h3>${groupIcon(label, groupBy)}${escapeHtml(label)} <span>${groupedCards.length}</span></h3>
      <div ${gridAttributes}>${groupedCards.map((card) => renderCatalogCard(card, ownerId)).join("")}</div>
    </section>
  `,
    )
    .join("");
}

function catalogMobileColumnCount() {
  return Math.max(1, Math.min(4, Number(state.catalog.mobileColumns) || 1));
}

function catalogGridAttributes() {
  const mobileColumns = catalogMobileColumnCount();
  const compactClass = mobileColumns > 1 ? " is-mobile-compact" : "";
  return `class="card-grid catalog-card-grid${compactClass}" style="--mobile-card-cols: ${mobileColumns}"`;
}

function renderCatalogCard(card, ownerId = "") {
  const ownerInventory = ownerInventoryForFilter(ownerId);
  const quantity = ownerInventory
    ? (ownerInventory[card.id] ?? 0)
    : availableCopies(card.id);
  const rarity = rarityConfig[card.rarity] ?? rarityConfig.common;
  const wishlisted = isWishlisted(card.id);
  const deckQuantity = myDeckCardQuantity(card.id);
  return `
    <article class="item-card catalog-card ${quantity <= 0 ? "disabled" : ""} ${wishlisted ? "is-wishlisted" : ""}" data-preview-card="${card.id}">
      ${renderImage(card)}
      ${deckQuantity ? renderDeckBookmark(deckQuantity) : ""}
      <div>
        <div class="spread">
          <div>
            <div class="card-title">${renderTypeIcon(card.typeCategory)}${escapeHtml(card.name)}</div>
            <div class="card-meta">${renderManaCost(card.manaCost)} ${renderRarityIcon(card.rarity)} ${card.setCode} #${card.collectorNumber} · ${rarity.label}</div>
            <div class="card-meta">${escapeHtml(card.typeLine)}${card.creatureTypes.length ? ` · ${escapeHtml(card.creatureTypes.join(", "))}` : ""}</div>
            ${renderKeywordIcons(card.keywords)}
          </div>
          <div class="catalog-card-actions">
            <span class="rarity-badge rarity-${card.rarity}">${quantity}</span>
            <button class="ghost-button wishlist-card-button ${wishlisted ? "is-active" : ""}" type="button" data-action="toggle-wishlist-card" data-card-id="${card.id}" title="${wishlisted ? "Quitar de wishlist" : "Añadir a wishlist"}" aria-label="${wishlisted ? "Quitar" : "Añadir"} ${escapeHtml(card.name)} ${wishlisted ? "de" : "a"} wishlist"><span class="wishlist-bookmark-icon" aria-hidden="true"></span> Wishlist</button>
          </div>
        </div>
        ${wishlisted ? `<div class="wishlist-inline-badge"><span class="wishlist-bookmark-icon" aria-hidden="true"></span> Wishlist</div>` : ""}
        ${quantity > 0 ? renderOwners(card.id, ownerId) : `<p class="muted small">No disponible</p>`}
      </div>
    </article>
  `;
}

function renderPagination(totalPages) {
  if (state.catalog.pageSize === "all") return "";
  return `
    <div class="pagination">
      <button class="ghost-button" type="button" data-action="prev-page" title="Ir a la página anterior" aria-label="Página anterior" ${state.catalog.page <= 1 ? "disabled" : ""}>Anterior</button>
      <span class="muted small">Página ${state.catalog.page} de ${totalPages}</span>
      <button class="ghost-button" type="button" data-action="next-page" title="Ir a la página siguiente" aria-label="Página siguiente" ${state.catalog.page >= totalPages ? "disabled" : ""}>Siguiente</button>
    </div>
  `;
}
