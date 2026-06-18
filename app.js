const rarityConfig = {
  mythic: { label: "Mítica", points: 8 },
  rare: { label: "Dorada", points: 4 },
  uncommon: { label: "Plateada", points: 2 },
  common: { label: "Normal", points: 1 },
};

const storageKeys = {
  trades: "mtg-trade-trades-v2",
  bulks: "mtg-trade-bulks-v2",
  myDeck: "mtg-trade-my-deck-v1",
  settings: "mtg-trade-settings-v1",
  oldMine: "mtg-trade-mine",
  oldTheirs: "mtg-trade-theirs",
};

const colorConfig = [
  { value: "W", icon: "mana-w.svg", title: "Blanco" },
  { value: "U", icon: "mana-u.svg", title: "Azul" },
  { value: "B", icon: "mana-b.svg", title: "Negro" },
  { value: "R", icon: "mana-r.svg", title: "Rojo" },
  { value: "G", icon: "mana-g.svg", title: "Verde" },
  { value: "C", icon: "mana-c.svg", title: "Incoloro" },
];

const allOwnersFilterValue = "__allOwners";

const comparisonOptions = [
  ["any", "Cualquiera"],
  ["eq", "Igual"],
  ["lt", "Menor que"],
  ["lte", "Menor o igual"],
  ["gt", "Mayor que"],
  ["gte", "Mayor o igual"],
];

const quickFilterSets = {
  strixhaven: {
    label: "Strixhaven",
    icon: "set-stx.svg",
    setCodes: ["SOS", "SOA", "SOC", "STX"],
    synergies: [
      { name: "Lorehold", colors: ["R", "W"] },
      { name: "Prismari", colors: ["U", "R"] },
      { name: "Quandrix", colors: ["G", "U"] },
      { name: "Silverquill", colors: ["W", "B"] },
      { name: "Witherbloom", colors: ["B", "G"] },
    ],
  },
  avatar: {
    label: "Avatar",
    icon: "set-tla.svg",
    setCodes: ["TLA"],
    synergies: [
      { name: "Air Nomads", colors: ["W", "U"] },
      { name: "Earth Kingdom", colors: ["R", "G"] },
      { name: "Fire Nation", colors: ["B", "R"] },
      { name: "Team Avatar", colors: ["G", "W"] },
    ],
  },
};

const quickSynergies = Object.values(quickFilterSets).flatMap((set) =>
  set.synergies.map((synergy) => ({ ...synergy, setLabel: set.label })),
);

const savedSettings = load(storageKeys.settings, {});

const state = {
  cards: [],
  cardById: new Map(),
  cardByName: new Map(),
  trades: load(storageKeys.trades, []),
  bulks: load(storageKeys.bulks, []),
  myDeck: load(storageKeys.myDeck, { cards: {}, sourceUrl: "", updatedAt: "" }),
  settings: {
    hoverPreview: true,
    dragSort: true,
    captureView: false,
    ...savedSettings,
  },
  currentTradeId: null,
  tradeFilters: {
    mine: defaultFilters(),
    theirs: defaultFilters(),
  },
  openFilters: {
    mine: false,
    theirs: false,
    catalog: false,
    deck: false,
  },
  tradeView: savedSettings.captureView ? "grid" : "list",
  tradeEditorOpen: false,
  captureExpanded: false,
  activeSynergy: {
    mine: "",
    theirs: "",
    catalog: "",
    deck: "",
  },

  catalog: {
    page: 1,
    pageSize: 50,
    query: "",
    sortBy: "name",
    sortDir: "asc",
    groupBy: "none",
    filters: defaultFilters(),
  },
  deck: {
    query: "",
    filters: defaultFilters(),
  },
  tradeDeckMissing: {
    theirs: false,
  },
  cloud: {
    configured: false,
    loading: true,
    session: null,
    user: null,
    profile: null,
    message: "",
    error: "",
    bulksLoading: false,
  },
};

const app = document.querySelector("#app");
const datasetStatus = document.querySelector("#datasetStatus");
const topNavActions = document.querySelector("#topNavActions");
let previewTimer = null;
let draggedTradeCard = null;
let dragDropTarget = null;
let dragDropPosition = "before";
let hasRenderedRoute = false;

init();

async function init() {
  migrateOldTrade();
  bindGlobalEvents();
  await initCloudAuth();
  await loadCards();
  const importedTradeId = await handleSharedTradeFromUrl();
  if (importedTradeId) location.hash = `#/trade/${importedTradeId}`;
  renderRoute();
  hasRenderedRoute = true;
}

async function initCloudAuth() {
  const cloud = window.mtgCloud;
  state.cloud.configured = Boolean(cloud?.isConfigured?.());

  if (!state.cloud.configured) {
    state.cloud.loading = false;
    state.cloud.message =
      "Configura Supabase para activar login y sincronización.";
    return;
  }

  try {
    cloud.onAuthStateChange(async (_event, session) => {
      await setCloudSession(session);
      if (hasRenderedRoute) renderRoute();
    });
    const session = await cloud.getSession();
    await setCloudSession(session);
  } catch (error) {
    console.error(error);
    state.cloud.error = error.message || "No se pudo conectar con Supabase.";
  } finally {
    state.cloud.loading = false;
  }
}

async function setCloudSession(session) {
  state.cloud.session = session;
  state.cloud.user = session?.user ?? null;
  state.cloud.profile = null;
  state.cloud.error = "";

  if (!state.cloud.user) {
    state.bulks = load(storageKeys.bulks, []);
    return;
  }

  try {
    state.cloud.profile = await window.mtgCloud.getProfile(state.cloud.user.id);
    if (state.cloud.profile) await loadCloudBulks();
  } catch (error) {
    console.error(error);
    state.cloud.error = error.message || "No se pudo cargar el perfil.";
  }
}

async function signInWithMagicLink() {
  const input = document.querySelector("#authEmail");
  const email = input?.value.trim();
  if (!email) return;

  state.cloud.message = "";
  state.cloud.error = "";
  renderHome();

  try {
    await window.mtgCloud.signInWithEmail(email);
    state.cloud.message = "Te hemos enviado un enlace mágico al email.";
  } catch (error) {
    console.error(error);
    state.cloud.error = error.message || "No se pudo enviar el enlace mágico.";
  }
  renderHome();
}

async function signOutFromCloud() {
  state.cloud.message = "";
  state.cloud.error = "";
  try {
    await window.mtgCloud.signOut();
    await setCloudSession(null);
    state.cloud.message = "Sesión cerrada.";
  } catch (error) {
    console.error(error);
    state.cloud.error = error.message || "No se pudo cerrar sesión.";
  }
  renderRoute();
}

async function saveCloudProfileFromForm() {
  const usernameInput = document.querySelector("#profileUsername");
  const displayNameInput = document.querySelector("#profileDisplayName");
  const username = normalizeUsername(usernameInput?.value ?? "");
  const displayName = displayNameInput?.value.trim() ?? "";

  state.cloud.message = "";
  state.cloud.error = "";

  if (!state.cloud.user) {
    state.cloud.error = "Inicia sesión antes de crear el perfil.";
    renderHome();
    return;
  }

  if (!isValidUsername(username)) {
    state.cloud.error =
      "El username debe tener 3-24 caracteres y solo letras, números, guion o guion bajo.";
    renderHome();
    return;
  }

  try {
    state.cloud.profile = await window.mtgCloud.saveProfile(
      state.cloud.user.id,
      username,
      displayName,
    );
    await loadCloudBulks();
    state.cloud.message = "Perfil guardado.";
  } catch (error) {
    console.error(error);
    state.cloud.error =
      error.code === "23505"
        ? "Ese username ya está en uso."
        : error.message || "No se pudo guardar el perfil.";
  }
  renderHome();
}

function normalizeUsername(value) {
  return value.trim().toLocaleLowerCase("es");
}

function isValidUsername(value) {
  return /^[a-z0-9_-]{3,24}$/.test(value);
}

function isCloudReady() {
  return Boolean(
    state.cloud.configured && state.cloud.user && state.cloud.profile,
  );
}

async function loadCloudBulks() {
  if (!isCloudReady()) return;
  state.cloud.bulksLoading = true;
  try {
    state.bulks = await window.mtgCloud.fetchBulks(state.cloud.user.id);
    state.cloud.error = "";
  } catch (error) {
    console.error(error);
    state.cloud.error =
      error.message || "No se pudieron cargar los bulks de la nube.";
  } finally {
    state.cloud.bulksLoading = false;
  }
}

async function refreshCloudBulks() {
  if (!isCloudReady()) return;
  await loadCloudBulks();
  renderRoute();
}

async function loadCards() {
  try {
    const datasets = await fetchJson("data/manifest.json");
    const loadedSets = await Promise.all(
      datasets.map(async (dataset) => ({
        ...dataset,
        cards: await fetchJson(dataset.file),
      })),
    );

    state.cards = loadedSets
      .flatMap((dataset) =>
        dataset.cards.map((card) => normalizeCard(card, dataset)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    state.cardById = new Map(state.cards.map((card) => [card.id, card]));
    state.cardByName = new Map();
    state.cards.forEach((card) => {
      [card.name, card.originalName].filter(Boolean).forEach((name) => {
        const key = normalizeName(name);
        if (!state.cardByName.has(key)) state.cardByName.set(key, card);
      });
    });

    datasetStatus.textContent = `${state.cards.length} cartas cargadas · ${loadedSets.map((set) => set.code).join(", ")}`;
  } catch (error) {
    console.error(error);
    datasetStatus.textContent =
      "No se han podido cargar los JSON. Abre la web con un servidor local.";
  }
}

function bindGlobalEvents() {
  window.addEventListener("hashchange", renderRoute);

  document.addEventListener("focusin", (event) => {
    if (event.target.matches("[data-search-side]")) {
      renderSearch(event.target.dataset.searchSide, event.target.value);
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-trade-name]")) {
      const trade = currentTrade();
      if (!trade) return;
      trade.name = event.target.value.trim() || "Trade sin nombre";
      saveTrades();
      renderTradeHeader(trade);
    }

    if (event.target.matches("[data-trade-code]")) {
      const trade = currentTrade();
      if (!trade) return;
      trade.code = normalizeTradeCode(event.target.value);
      event.target.value = trade.code;
      saveTrades();
    }

    if (event.target.matches("[data-search-side]")) {
      renderSearch(event.target.dataset.searchSide, event.target.value);
    }

    if (event.target.matches("#catalogSearch")) {
      state.catalog.query = event.target.value;
      state.catalog.page = 1;
      renderCardsPage({ keepSearchFocus: true });
    }

    if (event.target.matches("#deckSearch")) {
      state.deck.query = event.target.value;
      renderDeckPage({ keepSearchFocus: true });
    }

    if (event.target.matches("[data-filter]")) {
      updateFilterFromControl(event.target);
    }
  });

  document.addEventListener("change", async (event) => {
    if (event.target.matches("#importDataFile")) {
      const file = event.target.files?.[0];
      if (file) await importAppData(file);
      event.target.value = "";
      return;
    }

    if (event.target.matches("[data-owner-select]")) {
      const trade = currentTrade();
      if (!trade) return;
      trade[event.target.dataset.ownerSelect] = event.target.value;
      saveTrades();
      renderTradePage(trade.id);
    }

    if (event.target.matches("#pageSize")) {
      state.catalog.pageSize =
        event.target.value === "all" ? "all" : Number(event.target.value);
      state.catalog.page = 1;
      renderCardsPage();
    }

    if (event.target.matches("#sortBy")) {
      state.catalog.sortBy = event.target.value;
      state.catalog.page = 1;
      renderCardsPage();
    }

    if (event.target.matches("#sortDir")) {
      state.catalog.sortDir = event.target.value;
      renderCardsPage();
    }

    if (event.target.matches("#groupBy")) {
      state.catalog.groupBy = event.target.value;
      state.catalog.page = 1;
      renderCardsPage();
    }

    if (event.target.matches("[data-trade-sort-preset]")) {
      applyTradeSortPreset(event.target.dataset.side, event.target.value);
    }

    if (event.target.matches("[data-deck-missing-filter]")) {
      const side = event.target.dataset.side;
      state.tradeDeckMissing[side] = event.target.checked;
      const input = document.querySelector(`[data-search-side='${side}']`);
      renderSearch(side, input?.value ?? "");
    }

    if (event.target.matches("[data-filter]")) {
      updateFilterFromControl(event.target);
    }
  });

  document.addEventListener("contextmenu", (event) => {
    const image = event.target.closest("[data-trade-card] > img");
    if (!image) return;
    const row = image.closest("[data-trade-card]");
    if (!row) return;
    event.preventDefault();
    hideCardPreview();
    toggleCardRemoved(row.dataset.side, row.dataset.cardId);
  });

  document.addEventListener("click", async (event) => {
    const clickedPreviewImage = event.target.closest(
      "[data-preview-card] > img",
    );
    const clickedPreviewTarget = clickedPreviewImage?.closest(
      "[data-preview-card]",
    );
    if (
      clickedPreviewTarget &&
      !draggedTradeCard &&
      !clickedPreviewImage.closest("button[data-action], a[data-action]")
    ) {
      showCardPreview(clickedPreviewTarget.dataset.previewCard);
      return;
    }

    const action = event.target.closest("button[data-action], a[data-action]");
    if (action) {
      await handleAction(action, event);
      return;
    }

    if (!event.target.closest(".search-box")) {
      closeResults("mine");
      closeResults("theirs");
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.matches("[data-bulk-form]")) {
      event.preventDefault();
      await saveBulkFromForm();
      return;
    }

    if (event.target.matches("[data-my-deck-form]")) {
      event.preventDefault();
      await saveMyDeckFromForm();
      return;
    }

    if (event.target.matches("[data-auth-form]")) {
      event.preventDefault();
      await signInWithMagicLink();
      return;
    }

    if (event.target.matches("[data-profile-form]")) {
      event.preventDefault();
      await saveCloudProfileFromForm();
    }
  });

  document.addEventListener("dragstart", (event) => {
    if (!state.settings.dragSort) {
      event.preventDefault();
      return;
    }
    hideCardPreview();
    const row = event.target.closest("[data-trade-card]");
    if (!row) return;
    draggedTradeCard = {
      side: row.dataset.side,
      cardId: row.dataset.cardId,
    };
    document.body.classList.add("is-drag-sorting");
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  });

  document.addEventListener("dragend", (event) => {
    event.target.closest("[data-trade-card]")?.classList.remove("is-dragging");
    clearDragDropTarget();
    document.body.classList.remove("is-drag-sorting");
    draggedTradeCard = null;
  });

  document.addEventListener("dragover", (event) => {
    const row = event.target.closest("[data-trade-card]");
    if (!row || !draggedTradeCard || row.dataset.side !== draggedTradeCard.side)
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragDropTarget(row, dropPositionForEvent(row, event));
  });

  document.addEventListener("dragleave", (event) => {
    if (!dragDropTarget) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && dragDropTarget.contains(nextTarget)) return;
    if (!nextTarget?.closest?.("[data-trade-card]")) clearDragDropTarget();
  });

  document.addEventListener("drop", (event) => {
    const row = event.target.closest("[data-trade-card]");
    if (!row || !draggedTradeCard || row.dataset.side !== draggedTradeCard.side)
      return;
    event.preventDefault();
    const dropPosition = dragDropPosition;
    clearDragDropTarget();
    document.body.classList.remove("is-drag-sorting");
    reorderTradeCard(
      draggedTradeCard.side,
      draggedTradeCard.cardId,
      row.dataset.cardId,
      dropPosition,
    );
  });

  document.addEventListener("mouseover", (event) => {
    if (!state.settings.hoverPreview || draggedTradeCard) return;
    const image = event.target.closest("[data-preview-card] > img");
    const target = image?.closest("[data-preview-card]");
    if (!target) return;
    scheduleCardPreview(target.dataset.previewCard);
  });

  document.addEventListener("mouseout", (event) => {
    const image = event.target.closest("[data-preview-card] > img");
    const target = image?.closest("[data-preview-card]");
    if (!target) return;
    hideCardPreview();
  });

  document.addEventListener(
    "toggle",
    (event) => {
      if (!event.target.matches("[data-filter-panel]")) return;
      state.openFilters[event.target.dataset.scope] = event.target.open;
      syncBodyScrollLock();
    },
    true,
  );
}

async function handleAction(action, event) {
  const name = action.dataset.action;

  if (name === "new-trade") {
    const trade = createTrade();
    location.hash = `#/trade/${trade.id}`;
  }

  if (name === "open-trade")
    location.hash = `#/trade/${action.dataset.tradeId}`;

  if (name === "delete-trade") {
    if (!confirm("¿Eliminar este trade?")) return;
    state.trades = state.trades.filter(
      (trade) => trade.id !== action.dataset.tradeId,
    );
    saveTrades();
    renderHome();
  }

  if (name === "export-data") exportAppData();

  if (name === "import-data")
    document.querySelector("#importDataFile")?.click();

  if (name === "sign-out") {
    await signOutFromCloud();
  }

  if (name === "add-card") {
    const button = action;
    addCard(button.dataset.side, button.dataset.cardId);
    const input = document.querySelector(
      `[data-search-side='${button.dataset.side}']`,
    );
    if (input) input.value = "";
    closeResults(button.dataset.side);
  }

  if (name === "quantity")
    changeQuantity(
      action.dataset.side,
      action.dataset.cardId,
      Number(action.dataset.delta),
    );

  if (name === "toggle-card-mark") {
    toggleCardMark(
      action.dataset.side,
      action.dataset.cardId,
      action.dataset.mark,
    );
  }

  if (name === "toggle-card-removed") {
    toggleCardRemoved(action.dataset.side, action.dataset.cardId);
  }

  if (name === "clear-side") clearList(action.dataset.side);

  if (name === "toggle-trade-view") {
    state.tradeView = state.tradeView === "grid" ? "list" : "grid";
    state.settings.captureView = state.tradeView === "grid";
    state.captureExpanded = false;
    saveSettings();
    const trade = currentTrade();
    if (trade) renderTradePage(trade.id);
  }

  if (name === "toggle-capture-expanded") {
    state.captureExpanded = !state.captureExpanded;
    syncBodyScrollLock();
    const trade = currentTrade();
    if (trade) renderTradePage(trade.id);
  }

  if (name === "share-trade") {
    await shareCurrentTrade();
  }

  if (name === "toggle-trade-editor") {
    state.tradeEditorOpen = !state.tradeEditorOpen;
    const trade = currentTrade();
    if (trade) {
      renderTopNavActions({ page: "trade", id: trade.id });
      renderTradePage(trade.id);
    }
  }

  if (name === "toggle-setting") {
    const setting = action.dataset.setting;
    if (setting && setting in state.settings) {
      state.settings[setting] = !state.settings[setting];
      saveSettings();
      hideCardPreview();
      const trade = currentTrade();
      if (trade) renderTradePage(trade.id);
    }
  }

  if (name === "reset-filters") {
    resetFilters(action.dataset.scope);
  }

  if (name === "close-filters") {
    closeFilters(action.dataset.scope);
  }

  if (name === "quick-filter-set") {
    setQuickFilterSet(action.dataset.scope, action.dataset.set);
  }

  if (name === "quick-synergy") {
    applyQuickSynergy(
      action.dataset.scope,
      action.dataset.colors,
      action.dataset.synergy,
    );
  }

  if (name === "save-bulk") {
    event.preventDefault();
    await saveBulkFromForm();
  }

  if (name === "save-my-deck") {
    event.preventDefault();
    await saveMyDeckFromForm();
  }

  if (name === "clear-my-deck") {
    if (!confirm("¿Vaciar el deck guardado?")) return;
    state.myDeck = { cards: {}, sourceUrl: "", updatedAt: "" };
    saveMyDeck();
    renderDeckPage();
  }

  if (name === "delete-bulk") {
    if (!confirm("¿Eliminar este bulk?")) return;
    await deleteBulk(action.dataset.bulkId);
  }

  if (name === "refresh-cloud-bulks") {
    await refreshCloudBulks();
  }

  if (name === "prev-page" && state.catalog.page > 1) {
    state.catalog.page -= 1;
    renderCardsPage();
  }

  if (name === "next-page") {
    state.catalog.page += 1;
    renderCardsPage();
  }
}

function route() {
  const hash = location.hash || "#/";
  const [, page, id] = hash.match(/^#\/?([^/]*)(?:\/(.*))?$/) || [];
  return { page: page || "home", id };
}

function renderRoute() {
  const current = route();
  if (current.page !== "trade") {
    state.tradeEditorOpen = false;
    state.captureExpanded = false;
  }
  renderTopNavActions(current);
  document
    .querySelectorAll(".top-nav a")
    .forEach((link) =>
      link.classList.toggle(
        "active",
        link.dataset.route === current.page ||
          (current.page === "trade" && link.dataset.route === "home"),
      ),
    );

  if (current.page === "bulks") renderBulksPage();
  else if (current.page === "deck") renderDeckPage();
  else if (current.page === "cards") renderCardsPage();
  else if (current.page === "trade" && current.id) renderTradePage(current.id);
  else renderHome();
}

function renderTopNavActions(current = route()) {
  if (!topNavActions) return;
  if (current.page !== "trade" || !current.id) {
    topNavActions.innerHTML = "";
    return;
  }
  topNavActions.innerHTML = `<button class="ghost-button nav-edit-button icon-only" type="button" data-action="share-trade" title="Copiar enlace para compartir" aria-label="Compartir trade"><span aria-hidden="true">🔗</span></button><button class="ghost-button nav-edit-button icon-only ${state.tradeEditorOpen ? "is-active" : ""}" type="button" data-action="toggle-trade-editor" title="Editar trade" aria-label="Editar trade"><span aria-hidden="true">✎</span></button>`;
}

function sortCards(cards, sortBy, sortDir, ownerId = "") {
  const direction = sortDir === "desc" ? -1 : 1;
  return [...cards].sort((a, b) => {
    let result = 0;
    if (sortBy === "manaValue")
      result = a.manaValue - b.manaValue || a.name.localeCompare(b.name, "es");
    else if (sortBy === "type")
      result =
        a.typeCategory.localeCompare(b.typeCategory, "es") ||
        a.name.localeCompare(b.name, "es");
    else if (sortBy === "creatureType")
      result =
        (a.creatureTypes[0] ?? "").localeCompare(
          b.creatureTypes[0] ?? "",
          "es",
        ) || a.name.localeCompare(b.name, "es");
    else if (sortBy === "rarity")
      result =
        (rarityConfig[a.rarity]?.points ?? 0) -
          (rarityConfig[b.rarity]?.points ?? 0) ||
        a.name.localeCompare(b.name, "es");
    else if (sortBy === "quantity")
      result =
        catalogCardQuantity(a.id, ownerId) -
          catalogCardQuantity(b.id, ownerId) ||
        a.name.localeCompare(b.name, "es");
    else result = a.name.localeCompare(b.name, "es");
    return result * direction;
  });
}

function groupLabel(card, groupBy, ownerId = "") {
  if (groupBy === "color")
    return colorLabel(card.colorIdentity.length ? card.colorIdentity : ["C"]);
  if (groupBy === "type") return card.typeCategory;
  if (groupBy === "creatureType") return card.creatureTypes[0] || "No criatura";
  if (groupBy === "rarity")
    return rarityConfig[card.rarity]?.label ?? card.rarity;
  if (groupBy === "owner") {
    const owners = state.bulks.filter(
      (bulk) =>
        ownerMatchesFilter(bulk.id, ownerId) && (bulk.cards[card.id] ?? 0) > 0,
    );
    return owners.map((owner) => owner.ownerName).join(", ") || "Sin persona";
  }
  return "Cartas";
}

function groupIcon(label, groupBy) {
  if (groupBy === "type") return renderTypeIcon(label);
  if (groupBy === "rarity") {
    const rarity =
      Object.entries(rarityConfig).find(
        ([, config]) => config.label === label,
      )?.[0] ?? "common";
    return renderRarityIcon(rarity);
  }
  if (groupBy === "color")
    return renderManaCost(
      label
        .split(" ")
        .map((part) => `{${part}}`)
        .join(""),
    );
  return "";
}

function colorLabel(colors) {
  const withoutC = colors.filter((color) => color !== "C");
  return withoutC.length ? withoutC.join(" ") : "C";
}

function renderTypeIcon(typeCategory) {
  const key = String(typeCategory || "").toLocaleLowerCase("es");
  const map = {
    creature: "type-creature",
    instant: "type-instant",
    sorcery: "type-sorcery",
    artifact: "type-artifact",
    enchantment: "type-enchantment",
    land: "type-land",
    planeswalker: "type-planeswalker",
  };
  const icon = map[key] ?? "type-sorcery";
  return `<img class="ui-icon" src="assets/icons/${icon}.svg" alt="${escapeHtml(typeCategory)}" title="${escapeHtml(typeCategory)}" />`;
}

function renderRarityIcon(rarity) {
  return `<img class="ui-icon rarity-icon-${rarity}" src="assets/icons/rarity-${rarity}.svg" alt="${escapeHtml(rarityConfig[rarity]?.label ?? rarity)}" title="${escapeHtml(rarityConfig[rarity]?.label ?? rarity)}" />`;
}

function renderManaCost(manaCost) {
  const symbols = String(manaCost || "").match(/\{[^}]+\}/g) ?? [];
  if (!symbols.length) return "";

  const grouped = symbols.reduce((accumulator, symbol) => {
    const clean = symbol.replace(/[{}]/g, "");
    accumulator.set(clean, (accumulator.get(clean) ?? 0) + 1);
    return accumulator;
  }, new Map());

  return `<span class="mana-cost">${[...grouped.entries()]
    .map(([symbol, count]) => renderManaSymbol(symbol, count))
    .join("")}</span>`;
}

function renderManaSymbol(symbol, count) {
  if (/^\d+$/.test(symbol) || symbol === "X") {
    return `<span class="mana-generic" title="{${escapeHtml(symbol)}}">${escapeHtml(symbol)}</span>`;
  }

  const clean = symbol.replace(/\//g, "");
  const file =
    clean.length === 1 && "WUBRGC".includes(clean)
      ? `mana-${clean.toLocaleLowerCase("es")}.svg`
      : "mana-c.svg";
  const label = `{${symbol}}`;
  const countLabel =
    count > 1 ? `<span class="mana-count">${count}</span>` : "";
  return `<span class="mana-symbol" title="${escapeHtml(label)} ×${count}"><img class="mana-icon" src="assets/icons/${file}" alt="${escapeHtml(label)}" />${countLabel}</span>`;
}

function renderKeywordIcons(keywords) {
  const map = {
    flying: ["kw-flying", "Flying"],
    haste: ["kw-haste", "Haste"],
    hexproof: ["kw-hexproof", "Hexproof"],
    vigilance: ["kw-vigilance", "Vigilance"],
    trample: ["kw-trample", "Trample"],
  };
  const icons = keywords
    .filter((keyword) => map[keyword])
    .map((keyword) => {
      const [icon, label] = map[keyword];
      return `<img class="ui-icon keyword-icon" src="assets/icons/${icon}.svg" alt="${label}" title="${label}" />`;
    });
  return icons.length
    ? `<div class="keyword-icons">${icons.join("")}</div>`
    : "";
}

function renderAdvancedFilters(scope, options = {}) {
  const filters = filtersForScope(scope);
  const compactClass = options.compact
    ? "advanced-filters compact"
    : "advanced-filters";
  return `
    <div class="filter-header-row">
      <details class="${compactClass} ${filtersAreActive(filters) ? "has-active-filters" : ""}" data-filter-panel data-scope="${scope}" ${state.openFilters[scope] ? "open" : ""}>
        <summary>Filtros</summary>
      <div class="advanced-popup">
        <div class="advanced-popup-header">
          <div>
            <p class="eyebrow">Búsqueda</p>
            <h3>Filtros avanzados</h3>
          </div>
          <button class="ghost-button" type="button" data-action="close-filters" data-scope="${scope}" title="Cerrar filtros avanzados" aria-label="Cerrar filtros avanzados">Cerrar</button>
        </div>
        <div class="advanced-grid">
        <label>Nombre de carta
          <input data-filter data-scope="${scope}" data-field="cardName" value="${escapeHtml(filters.cardName)}" placeholder="Ej. Berta" />
        </label>
        <label>Set / expansión
          <select data-filter data-scope="${scope}" data-field="setCode">
            <option value="">Cualquier set</option>
            ${setOptions(filters.setCode)}
          </select>
        </label>
        <label>Texto Oracle
          <input data-filter data-scope="${scope}" data-field="oracle" value="${escapeHtml(filters.oracle)}" placeholder="Ej. draw a card" />
        </label>
        <label>Tipo de carta
          <input data-filter data-scope="${scope}" data-field="type" value="${escapeHtml(filters.type)}" placeholder="Creature, Instant…" />
        </label>
        <label>Rareza
          <select data-filter data-scope="${scope}" data-field="rarity">
            <option value="">Cualquier rareza</option>
            ${Object.entries(rarityConfig)
              .map(
                ([rarity, config]) =>
                  `<option value="${rarity}" ${filters.rarity === rarity ? "selected" : ""}>${config.label}</option>`,
              )
              .join("")}
          </select>
        </label>
        ${
          options.includeOwner
            ? `<label>Persona
          <select data-filter data-scope="${scope}" data-field="ownerId">
            <option value="" ${filters.ownerId === "" ? "selected" : ""}>Sin filtro</option>
            <option value="${allOwnersFilterValue}" ${filters.ownerId === allOwnersFilterValue ? "selected" : ""}>Todas las personas</option>
            ${state.bulks.map((bulk) => `<option value="${bulk.id}" ${bulk.id === filters.ownerId ? "selected" : ""}>${escapeHtml(bulk.ownerName)}</option>`).join("")}
          </select>
        </label>`
            : ""
        }
        <div class="filter-block">
          <span>Colores</span>
          ${renderColorPicker(scope, "colors", filters.colors)}
          <select data-filter data-scope="${scope}" data-field="colorMode">
            <option value="all" ${filters.colorMode === "all" ? "selected" : ""}>Debe tener todos</option>
            <option value="any" ${filters.colorMode === "any" ? "selected" : ""}>Cualquiera</option>
            <option value="exact" ${filters.colorMode === "exact" ? "selected" : ""}>Exactamente estos</option>
            <option value="atMost" ${filters.colorMode === "atMost" ? "selected" : ""}>Como mucho estos</option>
          </select>
        </div>
        <div class="filter-block">
          <span>Identidad de color</span>
          ${renderColorPicker(scope, "colorIdentity", filters.colorIdentity)}
          <select data-filter data-scope="${scope}" data-field="colorIdentityMode">
            <option value="all" ${filters.colorIdentityMode === "all" ? "selected" : ""}>Debe tener todos</option>
            <option value="any" ${filters.colorIdentityMode === "any" ? "selected" : ""}>Cualquiera</option>
            <option value="exact" ${filters.colorIdentityMode === "exact" ? "selected" : ""}>Exactamente estos</option>
            <option value="atMost" ${filters.colorIdentityMode === "atMost" ? "selected" : ""}>Como mucho estos</option>
          </select>
        </div>
        <label>Mana value
          <div class="inline-fields">
            <select data-filter data-scope="${scope}" data-field="manaValueOp">
              ${comparisonOptions.map(([value, label]) => `<option value="${value}" ${filters.manaValueOp === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
            <input data-filter data-scope="${scope}" data-field="manaValue" value="${escapeHtml(filters.manaValue)}" inputmode="decimal" placeholder="3" />
          </div>
        </label>
        <label>Coste de maná
          <input data-filter data-scope="${scope}" data-field="manaCost" value="${escapeHtml(filters.manaCost)}" placeholder="Ej. {2}{G}" />
        </label>
        ${renderNumericFilter(scope, "power", "Fuerza", filters)}
        ${renderNumericFilter(scope, "toughness", "Resistencia", filters)}
        ${renderNumericFilter(scope, "loyalty", "Lealtad", filters)}
        <div class="advanced-actions">
          <button class="ghost-button" type="button" data-action="reset-filters" data-scope="${scope}" title="Restablecer todos los filtros" aria-label="Limpiar filtros">Limpiar filtros</button>
        </div>
        </div>
      </div>
      </details>
      ${renderQuickSynergyFilters(scope)}
    </div>
  `;
}

function renderQuickSynergyFilters(scope) {
  const filters = filtersForScope(scope);
  const activeEdition = filters?.quickEdition ?? "";
  return `<div class="quick-filters" aria-label="Filtros rápidos de edición y color">
    <div class="quick-filter-set-toggle" aria-label="Filtrar por edición">
      ${Object.entries(quickFilterSets)
        .map(
          ([setKey, set]) =>
            `<button class="ghost-button quick-set-button ${activeEdition === setKey ? "is-active" : ""}" type="button" data-action="quick-filter-set" data-scope="${scope}" data-set="${setKey}" title="Filtrar ${set.label}" aria-label="Filtrar ${set.label}"><img src="assets/icons/${set.icon}" alt="" aria-hidden="true" /></button>`,
        )
        .join("")}
    </div>
    ${quickSynergies.map((synergy) => `<button class="ghost-button quick-filter ${state.activeSynergy[scope] === synergy.name ? "is-active" : ""}" type="button" data-action="quick-synergy" data-scope="${scope}" data-synergy="${synergy.name}" data-colors="${synergy.colors.join("")}" title="${synergy.setLabel} · ${synergy.name}: como mucho ${synergy.colors.join("/")}" aria-label="${synergy.setLabel} ${synergy.name}">${renderManaCost(synergy.colors.map((color) => `{${color}}`).join(""))}</button>`).join("")}
    <button class="ghost-button quick-filter clear-filter" type="button" data-action="reset-filters" data-scope="${scope}" title="Limpiar filtros"><span>Limpiar</span></button>
  </div>`;
}

function renderNumericFilter(scope, field, label, filters) {
  const opField = `${field}Op`;
  return `<label>${label}
    <div class="inline-fields">
      <select data-filter data-scope="${scope}" data-field="${opField}">
        ${comparisonOptions.map(([value, optionLabel]) => `<option value="${value}" ${filters[opField] === value ? "selected" : ""}>${optionLabel}</option>`).join("")}
      </select>
      <input data-filter data-scope="${scope}" data-field="${field}" value="${escapeHtml(filters[field])}" inputmode="decimal" placeholder="3" />
    </div>
  </label>`;
}

function renderColorPicker(scope, field, selected) {
  return `<div class="color-picker">${colorConfig.map((color) => `<label title="${color.title}"><input type="checkbox" data-filter data-scope="${scope}" data-field="${field}" value="${color.value}" ${selected.includes(color.value) ? "checked" : ""} /><span><img class="mana-icon" src="assets/icons/${color.icon}" alt="${color.title}" /></span></label>`).join("")}</div>`;
}

function setOptions(selectedCode) {
  const sets = [
    ...new Map(
      state.cards.map((card) => [card.setCode, card.setName]),
    ).entries(),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  return sets
    .map(
      ([code, name]) =>
        `<option value="${code}" ${selectedCode === code ? "selected" : ""}>${code} · ${escapeHtml(name)}</option>`,
    )
    .join("");
}

function updateFilterFromControl(control) {
  const scope = control.dataset.scope;
  const field = control.dataset.field;
  const filters = filtersForScope(scope);
  if (!filters || !field) return;

  if (
    control.type === "checkbox" &&
    field !== "colors" &&
    field !== "colorIdentity"
  ) {
    filters[field] = control.checked;
  } else if (field === "colors" || field === "colorIdentity") {
    filters[field] = [
      ...document.querySelectorAll(
        `[data-filter][data-scope='${scope}'][data-field='${field}']:checked`,
      ),
    ].map((input) => input.value);
  } else {
    filters[field] = control.value;
  }

  if (field === "colors" || field === "colorMode") {
    state.activeSynergy[scope] = "";
  }

  if (field === "setCode") {
    filters.quickEdition = "";
  }

  if (scope === "catalog") {
    state.catalog.page = 1;
    renderCardsPage({ focusFilter: { field, value: control.value } });
  } else if (scope === "deck") {
    renderDeckPage({ focusFilter: { field, value: control.value } });
  } else {
    const input = document.querySelector(`[data-search-side='${scope}']`);
    renderSearch(scope, input?.value ?? "");
  }
}

function closeFilters(scope) {
  state.openFilters[scope] = false;
  syncBodyScrollLock();
  if (scope === "catalog") {
    renderCardsPage();
    return;
  }
  if (scope === "deck") {
    renderDeckPage();
    return;
  }
  const trade = currentTrade();
  if (trade) renderTradePage(trade.id);
}

function resetFilters(scope) {
  if (scope === "catalog") {
    state.catalog.filters = defaultFilters();
    state.openFilters.catalog = false;
    state.activeSynergy.catalog = "";
    syncBodyScrollLock();
    state.catalog.page = 1;
    renderCardsPage();
    return;
  }
  if (scope === "deck") {
    state.deck.filters = defaultFilters();
    state.openFilters.deck = false;
    state.activeSynergy.deck = "";
    syncBodyScrollLock();
    renderDeckPage();
    return;
  }
  state.tradeFilters[scope] = defaultFilters();
  state.openFilters[scope] = false;
  state.activeSynergy[scope] = "";
  syncBodyScrollLock();
  const trade = currentTrade();
  if (trade) renderTradePage(trade.id);
}

function setQuickFilterSet(scope, setKey) {
  if (!quickFilterSets[setKey]) return;
  const filters = filtersForScope(scope);
  if (!filters) return;
  filters.quickEdition = filters.quickEdition === setKey ? "" : setKey;
  filters.setCode = "";
  if (scope === "catalog") {
    state.catalog.page = 1;
    renderCardsPage();
    return;
  }
  if (scope === "deck") {
    renderDeckPage();
    return;
  }
  const trade = currentTrade();
  if (trade) renderTradePage(trade.id);
}

function applyQuickSynergy(scope, colorsValue, synergyName = "") {
  const filters = filtersForScope(scope);
  if (!filters) return;
  filters.colors = colorsValue.split("");
  filters.colorMode = "atMost";
  state.activeSynergy[scope] = synergyName;

  if (scope === "catalog") {
    state.catalog.page = 1;
    renderCardsPage();
    return;
  }
  if (scope === "deck") {
    renderDeckPage();
    return;
  }

  const trade = currentTrade();
  if (trade) renderTradePage(trade.id);
}

function syncBodyScrollLock() {
  document.body.classList.toggle(
    "no-scroll",
    Object.values(state.openFilters).some(Boolean) || state.captureExpanded,
  );
}

function filtersForScope(scope) {
  if (scope === "catalog") return state.catalog.filters;
  if (scope === "deck") return state.deck.filters;
  return state.tradeFilters[scope];
}

function defaultFilters() {
  return {
    cardName: "",
    setCode: "",
    quickEdition: "",
    oracle: "",
    type: "",
    rarity: "",
    ownerId: "",
    colors: [],
    colorMode: "all",
    colorIdentity: [],
    colorIdentityMode: "all",
    manaValueOp: "any",
    manaValue: "",
    manaCost: "",
    powerOp: "any",
    power: "",
    toughnessOp: "any",
    toughness: "",
    loyaltyOp: "any",
    loyalty: "",
  };
}

function filtersAreActive(filters) {
  return Boolean(
    filters.cardName ||
    filters.setCode ||
    filters.quickEdition ||
    filters.oracle ||
    filters.type ||
    filters.rarity ||
    filters.ownerId ||
    filters.colors.length ||
    filters.colorIdentity.length ||
    filters.manaValue ||
    filters.manaCost ||
    filters.power ||
    filters.toughness ||
    filters.loyalty,
  );
}

function filterCards(
  cards,
  {
    query = "",
    filters = defaultFilters(),
    ownerId = "",
    onlyOwnerCards = false,
  } = {},
) {
  const terms = query
    .trim()
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .filter(Boolean);
  const ownerInventory = ownerInventoryForFilter(ownerId);
  return cards.filter((card) => {
    if (terms.length && !terms.every((term) => card.searchable.includes(term)))
      return false;
    if (onlyOwnerCards && (ownerInventory?.[card.id] ?? 0) <= 0) return false;
    if (
      filters.cardName &&
      !normalizeName(card.name).includes(normalizeName(filters.cardName)) &&
      !normalizeName(card.originalName).includes(
        normalizeName(filters.cardName),
      )
    )
      return false;
    if (filters.setCode && card.setCode !== filters.setCode) return false;
    if (
      filters.quickEdition &&
      !quickFilterSets[filters.quickEdition]?.setCodes.includes(card.setCode)
    )
      return false;
    if (
      filters.oracle &&
      !card.oracle
        .toLocaleLowerCase("es")
        .includes(filters.oracle.toLocaleLowerCase("es"))
    )
      return false;
    if (
      filters.type &&
      !card.typeLine
        .toLocaleLowerCase("es")
        .includes(filters.type.toLocaleLowerCase("es"))
    )
      return false;
    if (filters.rarity && card.rarity !== filters.rarity) return false;
    if (
      filters.manaCost &&
      !card.manaCost
        .toLocaleLowerCase("es")
        .includes(filters.manaCost.toLocaleLowerCase("es"))
    )
      return false;
    if (!matchesColors(card.colors, filters.colors, filters.colorMode))
      return false;
    if (
      !matchesColors(
        card.colorIdentity,
        filters.colorIdentity,
        filters.colorIdentityMode,
      )
    )
      return false;
    if (!matchesNumeric(card.manaValue, filters.manaValueOp, filters.manaValue))
      return false;
    if (!matchesNumeric(card.power, filters.powerOp, filters.power))
      return false;
    if (!matchesNumeric(card.toughness, filters.toughnessOp, filters.toughness))
      return false;
    if (!matchesNumeric(card.loyalty, filters.loyaltyOp, filters.loyalty))
      return false;
    return true;
  });
}

function matchesColors(cardColors, selected, mode) {
  if (!selected.length) return true;
  const normalized = cardColors.length ? cardColors : ["C"];
  const selectedWithoutColorless = selected.filter((color) => color !== "C");
  const cardWithoutColorless = normalized.filter((color) => color !== "C");

  if (mode === "any")
    return selected.some((color) => normalized.includes(color));
  if (mode === "exact")
    return (
      selected.length === normalized.length &&
      selected.every((color) => normalized.includes(color))
    );
  if (mode === "atMost") {
    return cardWithoutColorless.every((color) =>
      selectedWithoutColorless.includes(color),
    );
  }
  return selected.every((color) => normalized.includes(color));
}

function matchesNumeric(cardValue, op, rawValue) {
  if (!rawValue || op === "any") return true;
  const expected = Number(rawValue);
  const actual = Number(cardValue);
  if (Number.isNaN(expected) || Number.isNaN(actual)) return false;
  if (op === "eq") return actual === expected;
  if (op === "lt") return actual < expected;
  if (op === "lte") return actual <= expected;
  if (op === "gt") return actual > expected;
  if (op === "gte") return actual >= expected;
  return true;
}

function parseCardList(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = [];
  const sectionWords = new Set([
    "creature",
    "creatures",
    "artifact",
    "artifacts",
    "instant",
    "instants",
    "sorcery",
    "sorceries",
    "enchantment",
    "enchantments",
    "land",
    "lands",
    "download",
    "group by",
    "sort by",
    "view mode",
  ]);

  lines.forEach((line) => {
    const cleaned = line.replace(/\s+/g, " ").replace(/^\*\s*/, "");
    if (sectionWords.has(cleaned.toLocaleLowerCase("es"))) return;

    const match = cleaned.match(/^(\d+)\s+(.+?)(?:\s+\([^)]+\))?$/);
    if (match) {
      parsed.push({
        quantity: Number(match[1]),
        name: stripCardSuffix(match[2]),
      });
      return;
    }

    // Fallback para texto de Manabox sin saltos limpios: intenta detectar "2Nombre de Carta" con cartas conocidas.
    state.cards.forEach((card) => {
      const pattern = new RegExp(
        `(^|\\D)(\\d{1,3})${escapeRegExp(card.originalName)}(?=$|\\D|\\d)`,
        "gi",
      );
      for (const found of cleaned.matchAll(pattern)) {
        const quantity = Number(found[2]);
        if (quantity > 99) continue;
        parsed.push({ quantity, name: card.originalName });
      }
    });
  });

  return parsed;
}

function stripCardSuffix(name) {
  return name
    .replace(/\s+\d+$/, "")
    .replace(/\s+\[[^\]]+\]$/, "")
    .trim();
}

function createTrade() {
  const trade = {
    id: uid(),
    name: `Trade ${state.trades.length + 1}`,
    code: defaultTradeCode(state.trades.length + 1),
    mineOwnerId: "",
    theirOwnerId: "",
    mine: {},
    theirs: {},
    marks: { mine: {}, theirs: {} },
    removed: { mine: {}, theirs: {} },
    order: { mine: [], theirs: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.trades.unshift(trade);
  saveTrades();
  return trade;
}

function currentTrade() {
  return (
    state.trades.find((trade) => trade.id === state.currentTradeId) ?? null
  );
}

function addCard(side, cardId) {
  const trade = currentTrade();
  if (!trade) return;
  ensureTradeMarks(trade);
  ensureTradeRemoved(trade);
  ensureTradeOrder(trade);
  trade[side][cardId] = (trade[side][cardId] ?? 0) + 1;
  if (!trade.order[side].includes(cardId)) trade.order[side].push(cardId);
  touchTrade(trade);
  renderTradePage(trade.id);
}

function changeQuantity(side, cardId, delta) {
  const trade = currentTrade();
  if (!trade) return;
  ensureTradeMarks(trade);
  ensureTradeRemoved(trade);
  ensureTradeOrder(trade);
  const next = (trade[side][cardId] ?? 0) + delta;
  if (next <= 0) {
    delete trade[side][cardId];
    delete trade.marks[side][cardId];
    delete trade.removed[side][cardId];
    trade.order[side] = trade.order[side].filter((id) => id !== cardId);
  } else trade[side][cardId] = next;
  touchTrade(trade);
  renderTradePage(trade.id);
}

function clearList(side) {
  const trade = currentTrade();
  if (!trade) return;
  ensureTradeMarks(trade);
  ensureTradeRemoved(trade);
  ensureTradeOrder(trade);
  trade[side] = {};
  trade.marks[side] = {};
  trade.removed[side] = {};
  trade.order[side] = [];
  touchTrade(trade);
  renderTradePage(trade.id);
}

function toggleCardMark(side, cardId, mark) {
  const trade = currentTrade();
  if (!trade || !["priority", "residual"].includes(mark)) return;
  ensureTradeMarks(trade);
  ensureTradeOrder(trade);
  if (trade.marks[side][cardId] === mark) {
    delete trade.marks[side][cardId];
  } else {
    trade.marks[side][cardId] = mark;
    moveMarkedCardInOrder(trade, side, cardId, mark);
  }
  touchTrade(trade);
  renderTradePage(trade.id);
}

function cardMark(side, cardId) {
  const trade = currentTrade();
  if (!trade) return "";
  ensureTradeMarks(trade);
  return trade.marks[side]?.[cardId] ?? "";
}

function toggleCardRemoved(side, cardId) {
  const trade = currentTrade();
  if (!trade) return;
  ensureTradeRemoved(trade);
  if (trade.removed[side][cardId]) delete trade.removed[side][cardId];
  else trade.removed[side][cardId] = true;
  touchTrade(trade);
  renderTradePage(trade.id);
}

function cardRemoved(side, cardId) {
  const trade = currentTrade();
  if (!trade) return false;
  ensureTradeRemoved(trade);
  return Boolean(trade.removed[side]?.[cardId]);
}

function ensureTradeMarks(trade) {
  trade.marks ??= { mine: {}, theirs: {} };
  trade.marks.mine ??= {};
  trade.marks.theirs ??= {};
  return trade.marks;
}

function ensureTradeRemoved(trade) {
  trade.removed ??= { mine: {}, theirs: {} };
  trade.removed.mine ??= {};
  trade.removed.theirs ??= {};
  return trade.removed;
}

function ensureTradeOrder(trade) {
  trade.order ??= { mine: [], theirs: [] };
  trade.order.mine = syncTradeOrder(trade.order.mine, trade.mine);
  trade.order.theirs = syncTradeOrder(trade.order.theirs, trade.theirs);
  return trade.order;
}

function syncTradeOrder(order = [], list = {}) {
  const ids = Object.keys(list);
  const known = order.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !known.includes(id));
  return [...known, ...missing];
}

function orderedTradeEntries(list, side) {
  const trade = currentTrade();
  if (!trade) return Object.entries(list);
  ensureTradeOrder(trade);
  return trade.order[side]
    .filter((cardId) => list[cardId] != null)
    .map((cardId) => [cardId, list[cardId]]);
}

function moveMarkedCardInOrder(trade, side, cardId, mark) {
  const order = trade.order[side].filter((id) => id !== cardId);
  if (mark === "priority") {
    const priorityCount = order.findIndex(
      (id) => trade.marks[side]?.[id] !== "priority",
    );
    order.splice(
      priorityCount === -1 ? order.length : priorityCount,
      0,
      cardId,
    );
  } else if (mark === "residual") {
    order.push(cardId);
  }
  trade.order[side] = syncTradeOrder(order, trade[side]);
}

function reorderTradeCard(
  side,
  draggedCardId,
  targetCardId,
  position = "before",
) {
  const trade = currentTrade();
  if (!trade || draggedCardId === targetCardId) return;
  ensureTradeOrder(trade);
  const order = trade.order[side].filter((id) => id !== draggedCardId);
  if (!targetCardId) {
    order.push(draggedCardId);
  } else {
    const targetIndex = order.indexOf(targetCardId);
    if (targetIndex === -1) return;
    order.splice(
      position === "after" ? targetIndex + 1 : targetIndex,
      0,
      draggedCardId,
    );
  }
  trade.order[side] = syncTradeOrder(order, trade[side]);
  touchTrade(trade);
  renderTradePage(trade.id);
}

function setDragDropTarget(row, position = "before") {
  if (dragDropTarget === row && dragDropPosition === position) return;
  clearDragDropTarget();
  dragDropTarget = row;
  dragDropPosition = position;
  dragDropTarget.classList.add("is-drop-target", `drop-${position}`);
}

function clearDragDropTarget() {
  dragDropTarget?.classList.remove(
    "is-drop-target",
    "drop-before",
    "drop-after",
  );
  dragDropTarget = null;
  dragDropPosition = "before";
}

function dropPositionForEvent(row, event) {
  const rect = row.getBoundingClientRect();
  const isGrid = row.classList.contains("is-grid-card");
  const cursorPosition = isGrid
    ? event.clientX - rect.left
    : event.clientY - rect.top;
  const size = isGrid ? rect.width : rect.height;
  return cursorPosition > size / 2 ? "after" : "before";
}

function applyTradeSortPreset(side, preset) {
  if (!preset) return;
  const trade = currentTrade();
  if (!trade) return;
  ensureTradeMarks(trade);
  ensureTradeOrder(trade);
  trade.order[side] = Object.keys(trade[side]).sort((cardIdA, cardIdB) =>
    compareTradeCards(cardIdA, cardIdB, trade, side, preset),
  );
  touchTrade(trade);
  renderTradePage(trade.id);
}

function compareTradeCards(cardIdA, cardIdB, trade, side, preset) {
  const cardA = getCard(cardIdA);
  const cardB = getCard(cardIdB);
  if (!cardA || !cardB) return cardA ? -1 : cardB ? 1 : 0;
  const byName = () => cardA.name.localeCompare(cardB.name, "es");

  if (preset === "default") {
    const rank = { priority: 0, "": 1, residual: 2 };
    const markA = trade.marks[side]?.[cardIdA] ?? "";
    const markB = trade.marks[side]?.[cardIdB] ?? "";
    return (rank[markA] ?? 1) - (rank[markB] ?? 1) || byName();
  }

  if (preset === "name") return byName();
  if (preset === "manaValue")
    return cardA.manaValue - cardB.manaValue || byName();
  if (preset === "manaCost")
    return cardA.manaCost.localeCompare(cardB.manaCost, "es") || byName();
  if (preset === "type")
    return (
      cardA.typeCategory.localeCompare(cardB.typeCategory, "es") ||
      cardA.typeLine.localeCompare(cardB.typeLine, "es") ||
      byName()
    );
  if (preset === "rarity")
    return (
      (rarityConfig[cardA.rarity]?.points ?? 0) -
        (rarityConfig[cardB.rarity]?.points ?? 0) || byName()
    );
  if (preset === "power")
    return sortableStat(cardA.power) - sortableStat(cardB.power) || byName();
  if (preset === "toughness")
    return (
      sortableStat(cardA.toughness) - sortableStat(cardB.toughness) || byName()
    );
  if (preset === "colorIdentity")
    return (
      colorSortKey(cardA).localeCompare(colorSortKey(cardB), "es") || byName()
    );
  if (preset === "quantity")
    return trade[side][cardB.id] - trade[side][cardA.id] || byName();
  return byName();
}

function sortableStat(value) {
  if (value === "*") return 99;
  const number = Number(value);
  return Number.isFinite(number) ? number : -1;
}

function colorSortKey(card) {
  const order = "WUBRGC";
  const colors = card.colorIdentity.length ? card.colorIdentity : ["C"];
  return colors
    .slice()
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .join("");
}

function calculateTradeTotals(trade, side) {
  return calculateTotals(trade?.[side] ?? {}, { trade, side });
}

function calculateTotals(list, options = {}) {
  const { trade = null, side = "" } = options;
  if (trade && side) ensureTradeRemoved(trade);
  return Object.entries(list).reduce(
    (totals, [cardId, quantity]) => {
      if (trade?.removed?.[side]?.[cardId]) return totals;
      const card = getCard(cardId);
      if (!card) return totals;
      const rarity = rarityConfig[card.rarity] ?? rarityConfig.common;
      totals.byRarity[card.rarity] =
        (totals.byRarity[card.rarity] ?? 0) + quantity;
      totals.cards += quantity;
      totals.points += quantity * rarity.points;
      return totals;
    },
    { cards: 0, points: 0, byRarity: {} },
  );
}

function totalInventory() {
  return state.bulks.reduce((inventory, bulk) => {
    Object.entries(bulk.cards).forEach(([cardId, quantity]) => {
      inventory[cardId] = (inventory[cardId] ?? 0) + quantity;
    });
    return inventory;
  }, {});
}

function ownerOwnedCopies(ownerId, cardId) {
  if (!ownerId) return 0;
  return state.bulks.find((bulk) => bulk.id === ownerId)?.cards[cardId] ?? 0;
}

function tradedCopiesForOwner(ownerId, cardId) {
  return tradeBreakdownForOwner(ownerId, cardId).reduce(
    (sum, item) => sum + activeBreakdownQuantity(item),
    0,
  );
}

function tradeBreakdownForOwner(ownerId, cardId) {
  if (!ownerId) return [];
  return state.trades
    .map((trade) => {
      const entries = [];
      if (trade.mineOwnerId === ownerId)
        entries.push(tradeCardBreakdownEntry(trade, "mine", cardId));
      if (trade.theirOwnerId === ownerId)
        entries.push(tradeCardBreakdownEntry(trade, "theirs", cardId));
      return combineTradeBreakdownEntries(trade, entries);
    })
    .filter((item) => item.quantity > 0);
}

function requestedBreakdownInOtherTrades(cardId) {
  const currentId = state.currentTradeId;
  return state.trades
    .filter((trade) => trade.id !== currentId)
    .map((trade) => tradeCardBreakdownEntry(trade, "theirs", cardId))
    .filter((item) => item.quantity > 0);
}

function tradeCardQuantity(trade, side, cardId) {
  ensureTradeRemoved(trade);
  return trade.removed[side]?.[cardId] ? 0 : (trade[side]?.[cardId] ?? 0);
}

function tradeCardBreakdownEntry(trade, side, cardId) {
  ensureTradeMarks(trade);
  ensureTradeRemoved(trade);
  const quantity = trade[side]?.[cardId] ?? 0;
  const removed = Boolean(trade.removed[side]?.[cardId]);
  return {
    trade,
    quantity,
    activeQuantity: removed ? 0 : quantity,
    mark: trade.marks[side]?.[cardId] ?? "",
    removed,
  };
}

function combineTradeBreakdownEntries(trade, entries) {
  const visibleEntries = entries.filter((entry) => entry.quantity > 0);
  const quantity = visibleEntries.reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );
  const activeQuantity = visibleEntries.reduce(
    (sum, entry) => sum + entry.activeQuantity,
    0,
  );
  const mark = visibleEntries.some((entry) => entry.mark === "priority")
    ? "priority"
    : visibleEntries.some((entry) => entry.mark === "residual")
      ? "residual"
      : "";
  return {
    trade,
    quantity,
    activeQuantity,
    mark,
    removed: visibleEntries.length > 0 && activeQuantity === 0,
  };
}

function activeBreakdownQuantity(item) {
  return item.activeQuantity ?? (item.removed ? 0 : item.quantity);
}

function renderTradeBreakdown(breakdown, variant = "stock") {
  if (!breakdown.length) return "";
  return `<div class="trade-breakdown ${variant === "requested" ? "is-requested" : ""}">${breakdown
    .map((item) => {
      const { trade, quantity, mark = "", removed = false } = item;
      const stateClass = removed
        ? "is-removed"
        : mark === "priority"
          ? "is-priority"
          : mark === "residual"
            ? "is-residual"
            : "";
      const icon = removed
        ? "⊘"
        : mark === "priority"
          ? "★"
          : mark === "residual"
            ? "◇"
            : "";
      const stateLabel = removed
        ? " · descartada"
        : mark === "priority"
          ? " · prioritaria"
          : mark === "residual"
            ? " · residual"
            : "";
      return `<a class="trade-bookmark ${stateClass}" href="#/trade/${trade.id}" target="_blank" rel="noopener" title="${escapeHtml(trade.name)} · ${quantity} carta${quantity === 1 ? "" : "s"}${stateLabel}">${icon ? `<span class="trade-bookmark-icon">${icon}</span>` : ""}<span>${escapeHtml(tradeCode(trade))}</span><strong>×${quantity}</strong></a>`;
    })
    .join("")}</div>`;
}

function tradeCode(trade) {
  return normalizeTradeCode(trade.code || trade.name || trade.id || "TRD");
}

function normalizeTradeCode(value) {
  return (
    String(value || "")
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 3)
      .toLocaleUpperCase("es") || "TRD"
  );
}

function defaultTradeCode(index) {
  return `T${String(index).padStart(2, "0")}`.slice(0, 3);
}

function renderTradeStockCounter(
  tradedQty,
  ownedQty,
  isOverTraded,
  variant = "inline",
) {
  const className = `trade-stock-counter ${variant === "badge" ? "as-badge" : ""} ${isOverTraded ? "is-over" : ""}`;
  return `<span class="${className}" title="Tradeando ${tradedQty} de ${ownedQty} disponibles">${tradedQty}/${ownedQty}</span>`;
}

function catalogCardQuantity(cardId, ownerId = "") {
  if (!ownerId || isAllOwnersFilter(ownerId)) return availableCopies(cardId);
  return state.bulks.find((bulk) => bulk.id === ownerId)?.cards[cardId] ?? 0;
}

function availableCopies(cardId) {
  return state.bulks.reduce((sum, bulk) => sum + (bulk.cards[cardId] ?? 0), 0);
}

function ownerInventoryForFilter(ownerId = "") {
  if (!ownerId) return null;
  if (isAllOwnersFilter(ownerId)) return totalInventory();
  return state.bulks.find((bulk) => bulk.id === ownerId)?.cards ?? {};
}

function isAllOwnersFilter(ownerId) {
  return ownerId === allOwnersFilterValue;
}

function ownerMatchesFilter(ownerId, filterOwnerId = "") {
  return (
    !filterOwnerId ||
    isAllOwnersFilter(filterOwnerId) ||
    ownerId === filterOwnerId
  );
}

function renderOwners(cardId, onlyOwnerId = "") {
  const owners = state.bulks.filter((bulk) => {
    if (!ownerMatchesFilter(bulk.id, onlyOwnerId)) return false;
    return (bulk.cards[cardId] ?? 0) > 0;
  });
  if (!owners.length) return "";
  return `<div class="owner-tags">${owners.map((bulk) => `<span class="owner-tag">${escapeHtml(bulk.ownerName)} ×${bulk.cards[cardId]}</span>`).join("")}</div>`;
}

function ownerOptions(selectedId, emptyLabel) {
  return `<option value="">${emptyLabel}</option>${state.bulks.map((bulk) => `<option value="${bulk.id}" ${bulk.id === selectedId ? "selected" : ""}>${escapeHtml(bulk.ownerName)}</option>`).join("")}`;
}

function ownerName(ownerId) {
  return state.bulks.find((bulk) => bulk.id === ownerId)?.ownerName ?? "";
}

function findCardByName(name) {
  const normalized = normalizeName(name);
  if (state.cardByName.has(normalized)) return state.cardByName.get(normalized);
  return state.cards.find(
    (card) =>
      normalizeName(card.name).includes(normalized) ||
      normalizeName(card.originalName).includes(normalized),
  );
}

function normalizeCard(card, dataset) {
  const image =
    card.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.normal ??
    card.image_uris?.small ??
    card.card_faces?.[0]?.image_uris?.small ??
    "";
  const previewImage =
    card.image_uris?.large ??
    card.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.large ??
    card.card_faces?.[0]?.image_uris?.normal ??
    image;
  const displayName = card.printed_name || card.name;
  const oracle = [
    card.oracle_text,
    ...(card.card_faces ?? []).map((face) => face.oracle_text),
  ]
    .filter(Boolean)
    .join(" ");
  const printedText = [
    card.printed_text,
    ...(card.card_faces ?? []).map((face) => face.printed_text),
  ]
    .filter(Boolean)
    .join(" ");
  const typeLine =
    card.type_line ??
    (card.card_faces ?? [])
      .map((face) => face.type_line)
      .filter(Boolean)
      .join(" // ");
  const manaCost =
    card.mana_cost ??
    (card.card_faces ?? [])
      .map((face) => face.mana_cost)
      .filter(Boolean)
      .join(" // ");
  const colors = card.colors ?? [
    ...new Set((card.card_faces ?? []).flatMap((face) => face.colors ?? [])),
  ];
  const colorIdentity = card.color_identity ?? [];
  const typeCategory = detectTypeCategory(typeLine);
  const creatureTypes = detectCreatureTypes(typeLine);
  const keywords = detectKeywords(`${oracle} ${typeLine}`);
  const searchable = [
    card.name,
    card.printed_name,
    oracle,
    printedText,
    typeLine,
    manaCost,
    typeCategory,
    creatureTypes.join(" "),
    keywords.join(" "),
    card.collector_number,
    card.rarity,
    dataset.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("es");
  return {
    id: card.id,
    name: displayName,
    originalName: card.name,
    setCode: dataset.code,
    setName: dataset.name,
    collectorNumber: card.collector_number,
    rarity: card.rarity,
    image,
    previewImage,
    oracle,
    typeLine,
    manaCost,
    manaValue: card.cmc ?? 0,
    colors,
    colorIdentity,
    typeCategory,
    creatureTypes,
    keywords,
    power: card.power ?? "",
    toughness: card.toughness ?? "",
    loyalty: card.loyalty ?? "",
    searchable,
  };
}

function detectTypeCategory(typeLine) {
  const line = String(typeLine).toLocaleLowerCase("es");
  if (line.includes("creature")) return "Creature";
  if (line.includes("instant")) return "Instant";
  if (line.includes("sorcery")) return "Sorcery";
  if (line.includes("artifact")) return "Artifact";
  if (line.includes("enchantment")) return "Enchantment";
  if (line.includes("planeswalker")) return "Planeswalker";
  if (line.includes("land")) return "Land";
  return "Other";
}

function detectCreatureTypes(typeLine) {
  const parts = String(typeLine).split("—");
  if (
    parts.length < 2 ||
    !parts[0].toLocaleLowerCase("es").includes("creature")
  )
    return [];
  return parts[1]
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function detectKeywords(text) {
  const normalized = String(text).toLocaleLowerCase("es");
  return ["flying", "haste", "hexproof", "vigilance", "trample"].filter(
    (keyword) => normalized.includes(keyword),
  );
}

function getCard(cardId) {
  return state.cardById.get(cardId);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Error cargando ${url}: ${response.status}`);
  return response.json();
}

function touchTrade(trade) {
  trade.updatedAt = new Date().toISOString();
  saveTrades();
}

function saveTrades() {
  localStorage.setItem(storageKeys.trades, JSON.stringify(state.trades));
}

async function shareCurrentTrade() {
  const trade = currentTrade();
  if (!trade) return;
  try {
    const payload = await encodeSharePayload(serializeTradeForShare(trade));
    const url = `${location.origin}${location.pathname}?share=${encodeURIComponent(payload)}${location.hash || `#/trade/${trade.id}`}`;
    await copyText(url);
    showToast("Enlace copiado");
  } catch (error) {
    console.error(error);
    alert("No se pudo generar el enlace compartido.");
  }
}

function serializeTradeForShare(trade) {
  ensureTradeMarks(trade);
  ensureTradeRemoved(trade);
  ensureTradeOrder(trade);
  return {
    v: 1,
    name: trade.name,
    code: tradeCode(trade),
    mine: trade.mine ?? {},
    theirs: trade.theirs ?? {},
    marks: trade.marks ?? { mine: {}, theirs: {} },
    removed: trade.removed ?? { mine: {}, theirs: {} },
    order: trade.order ?? { mine: [], theirs: [] },
  };
}

async function encodeSharePayload(payload) {
  const json = JSON.stringify(payload);
  if ("CompressionStream" in window) {
    const bytes = new TextEncoder().encode(json);
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return `gz:${base64UrlEncode(compressed)}`;
  }
  return `j:${base64UrlEncode(new TextEncoder().encode(json))}`;
}

async function decodeSharePayload(encoded) {
  const [mode, value] = encoded.includes(":")
    ? encoded.split(/:(.*)/s, 2)
    : ["j", encoded];
  const bytes = base64UrlDecode(value);
  if (mode === "gz") {
    if (!("DecompressionStream" in window))
      throw new Error("Este navegador no puede descomprimir el enlace.");
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function showToast(message, timeout = 1000) {
  let toast = document.querySelector("#appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, timeout);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  prompt("Copia este enlace:", text);
}

async function handleSharedTradeFromUrl() {
  const params = new URLSearchParams(location.search);
  const encoded = params.get("share");
  if (!encoded) return "";

  let payload;
  try {
    payload = await decodeSharePayload(encoded);
  } catch (error) {
    console.error(error);
    alert("No se pudo leer el trade compartido de la URL.");
    return "";
  }

  if (!isValidSharedTrade(payload)) {
    alert("El enlace compartido no contiene un trade válido.");
    return "";
  }

  const confirmed = confirm(
    `Este enlace contiene el trade compartido \"${payload.name || "Trade compartido"}\". ¿Importarlo a tus trades?`,
  );
  clearShareParamFromUrl();
  if (!confirmed) return "";

  const imported = sharedTradeToLocalTrade(payload);
  state.trades.unshift(imported);
  saveTrades();
  return imported.id;
}

function isValidSharedTrade(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    payload.v === 1 &&
    payload.mine &&
    payload.theirs &&
    typeof payload.mine === "object" &&
    typeof payload.theirs === "object"
  );
}

function sharedTradeToLocalTrade(payload) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: `${payload.name || "Trade compartido"} (compartido)`,
    code: normalizeTradeCode(payload.code || payload.name || "SHR"),
    mineOwnerId: "",
    theirOwnerId: "",
    mine: payload.mine ?? {},
    theirs: payload.theirs ?? {},
    marks: payload.marks ?? { mine: {}, theirs: {} },
    removed: payload.removed ?? { mine: {}, theirs: {} },
    order: payload.order ?? {
      mine: Object.keys(payload.mine ?? {}),
      theirs: Object.keys(payload.theirs ?? {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

function clearShareParamFromUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("share");
  history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${location.hash}`,
  );
}

function saveBulks() {
  localStorage.setItem(storageKeys.bulks, JSON.stringify(state.bulks));
}

function saveMyDeck() {
  localStorage.setItem(storageKeys.myDeck, JSON.stringify(state.myDeck));
}

function saveSettings() {
  localStorage.setItem(storageKeys.settings, JSON.stringify(state.settings));
}

function exportAppData() {
  const data = {
    app: "mtg-trade",
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    trades: state.trades,
    bulks: state.bulks,
    myDeck: state.myDeck,
    settings: state.settings,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mtg-trade-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importAppData(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (error) {
    console.error(error);
    alert("No se pudo leer el JSON de backup.");
    return;
  }

  if (!isValidAppData(data)) {
    alert("El archivo no parece ser un backup válido de MTG Trade.");
    return;
  }

  const tradeCount = data.trades.length;
  const bulkCount = data.bulks.length;
  const confirmed = confirm(
    `Esto reemplazará los datos guardados en este navegador por el backup:\n\n${tradeCount} trade${tradeCount === 1 ? "" : "s"}\n${bulkCount} persona${bulkCount === 1 ? "" : "s"} / bulk${bulkCount === 1 ? "" : "s"}\n\n¿Continuar?`,
  );
  if (!confirmed) return;

  state.trades = data.trades;
  state.bulks = data.bulks;
  state.myDeck = normalizeMyDeck(data.myDeck);
  state.settings = {
    hoverPreview: true,
    dragSort: true,
    captureView: false,
    ...(data.settings ?? {}),
  };
  state.tradeView = state.settings.captureView ? "grid" : "list";
  state.currentTradeId = null;
  saveTrades();
  saveBulks();
  saveMyDeck();
  saveSettings();
  hideCardPreview();
  renderRoute();
  alert("Backup importado correctamente.");
}

function isValidAppData(data) {
  return (
    data &&
    typeof data === "object" &&
    Array.isArray(data.trades) &&
    Array.isArray(data.bulks) &&
    (!data.myDeck || typeof data.myDeck === "object") &&
    (!data.settings || typeof data.settings === "object")
  );
}

function normalizeMyDeck(myDeck) {
  return {
    cards:
      myDeck?.cards && typeof myDeck.cards === "object" ? myDeck.cards : {},
    sourceUrl: myDeck?.sourceUrl ?? "",
    updatedAt: myDeck?.updatedAt ?? "",
  };
}

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function migrateOldTrade() {
  if (state.trades.length) return;
  const oldMine = load(storageKeys.oldMine, {});
  const oldTheirs = load(storageKeys.oldTheirs, {});
  if (!Object.keys(oldMine).length && !Object.keys(oldTheirs).length) return;
  state.trades.push({
    id: uid(),
    name: "Trade importado",
    mineOwnerId: "",
    theirOwnerId: "",
    mine: oldMine,
    theirs: oldTheirs,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveTrades();
}

function closeResults(side) {
  const container = document.querySelector(`#results-${side}`);
  if (!container) return;
  container.classList.remove("is-open");
  container.innerHTML = "";
}

function renderImage(card) {
  if (!card?.image) return `<div aria-hidden="true"></div>`;
  return `<img src="${card.image}" alt="${escapeHtml(card.name)}" loading="lazy" />`;
}

function scheduleCardPreview(cardId) {
  if (!state.settings.hoverPreview || draggedTradeCard) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => showCardPreview(cardId), 750);
}

function showCardPreview(cardId) {
  const card = getCard(cardId);
  if (!card?.previewImage) return;
  let preview = document.querySelector("#cardPreview");
  if (!preview) {
    preview = document.createElement("div");
    preview.id = "cardPreview";
    preview.className = "card-preview";
    document.body.append(preview);
  }
  preview.innerHTML = `<img src="${card.previewImage}" alt="${escapeHtml(card.name)}" />`;
  preview.classList.add("is-visible");
}

function hideCardPreview() {
  clearTimeout(previewTimer);
  previewTimer = null;
  document.querySelector("#cardPreview")?.classList.remove("is-visible");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeName(value) {
  return String(value)
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\/\/.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
