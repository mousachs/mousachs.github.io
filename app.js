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
  wishlist: "mtg-trade-wishlist-v1",
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
  wishlist: normalizeWishlist(load(storageKeys.wishlist, null)),
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
    wishlistFilter: "all",
    mobileControlsOpen: false,
    mobileColumns: 1,
    filters: defaultFilters(),
  },
  wishlistPanel: {
    open: false,
    query: "",
    groupBy: "owner",
    availability: "all",
    collapsedGroups: {},
  },
  deck: {
    query: "",
    filters: defaultFilters(),
    activeDeckId: "",
  },
  bulkDraft: {
    name: "",
    ownerName: "",
    visibility: "public",
    sourceUrl: "",
    sourceText: "",
    status: "",
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
    decksLoading: false,
    tradesLoading: false,
    dirtyTradeIds: new Set(),
    decks: [],
  },
};

const app = document.querySelector("#app");
const datasetStatus = document.querySelector("#datasetStatus");
const topNavActions = document.querySelector("#topNavActions");
const userNavLink = document.querySelector("#userNavLink");
const userNavIcon = document.querySelector("#userNavIcon");
const filterScopes = ["catalog", "deck", "mine", "theirs"];
let previewTimer = null;
let draggedTradeCard = null;
let dragDropTarget = null;
let dragDropPosition = "before";
let hasRenderedRoute = false;
let previousRouteHash = location.hash || "#/";
let suppressHashWarning = false;

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
    state.myDeck = load(storageKeys.myDeck, {
      cards: {},
      sourceUrl: "",
      updatedAt: "",
    });
    state.cloud.decks = [];
    state.cloud.dirtyTradeIds.clear();
    state.deck.activeDeckId = "";
    state.trades = load(storageKeys.trades, []);
    return;
  }

  try {
    state.cloud.profile = await window.mtgCloud.getProfile(state.cloud.user.id);
    if (state.cloud.profile) {
      await Promise.all([
        loadCloudBulks(),
        loadCloudDecks(),
        loadCloudTrades(),
      ]);
    }
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
  renderRoute();

  try {
    await window.mtgCloud.signInWithEmail(email);
    state.cloud.message = "Te hemos enviado un enlace mágico al email.";
  } catch (error) {
    console.error(error);
    state.cloud.error = error.message || "No se pudo enviar el enlace mágico.";
  }
  renderRoute();
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
    renderRoute();
    return;
  }

  if (!isValidUsername(username)) {
    state.cloud.error =
      "El username debe tener 3-24 caracteres y solo letras, números, guion o guion bajo.";
    renderRoute();
    return;
  }

  try {
    state.cloud.profile = await window.mtgCloud.saveProfile(
      state.cloud.user.id,
      username,
      displayName,
    );
    await Promise.all([loadCloudBulks(), loadCloudDecks(), loadCloudTrades()]);
    state.cloud.message = "Perfil guardado.";
  } catch (error) {
    console.error(error);
    state.cloud.error =
      error.code === "23505"
        ? "Ese username ya está en uso."
        : error.message || "No se pudo guardar el perfil.";
  }
  renderRoute();
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

async function loadCloudDecks(preferredDeckId = state.deck.activeDeckId) {
  if (!isCloudReady()) return;
  state.cloud.decksLoading = true;
  try {
    state.cloud.decks = await window.mtgCloud.fetchDecks(state.cloud.user.id);
    syncActiveCloudDeck(preferredDeckId);
    state.cloud.error = "";
  } catch (error) {
    console.error(error);
    state.cloud.error =
      error.message || "No se pudieron cargar los decks de la nube.";
  } finally {
    state.cloud.decksLoading = false;
  }
}

function syncActiveCloudDeck(preferredDeckId = state.deck.activeDeckId) {
  if (!isCloudReady()) return;
  const selected =
    state.cloud.decks.find((deck) => deck.id === preferredDeckId) ??
    state.cloud.decks[0] ??
    null;
  state.deck.activeDeckId = selected?.id ?? "";
  state.myDeck = selected
    ? {
        id: selected.id,
        name: selected.name,
        cards: selected.cards,
        sourceUrl: selected.sourceUrl,
        updatedAt: selected.updatedAt,
      }
    : { cards: {}, sourceUrl: "", updatedAt: "" };
}

async function refreshCloudDecks() {
  if (!isCloudReady()) return;
  await loadCloudDecks();
  renderRoute();
}

async function loadCloudTrades(preferredTradeId = state.currentTradeId) {
  if (!isCloudReady()) return;
  state.cloud.tradesLoading = true;
  try {
    const rows = await window.mtgCloud.fetchTrades(state.cloud.user.id);
    state.trades = rows.map(cloudTradeToLocalTrade).filter(Boolean);
    state.cloud.dirtyTradeIds.clear();
    if (
      preferredTradeId &&
      !state.trades.some((trade) => trade.id === preferredTradeId)
    ) {
      state.currentTradeId = null;
    }
    state.cloud.error = "";
  } catch (error) {
    console.error(error);
    state.cloud.error =
      error.message || "No se pudieron cargar los trades de la nube.";
  } finally {
    state.cloud.tradesLoading = false;
  }
}

async function refreshCloudTrades() {
  if (!isCloudReady()) return;
  if (!confirmLeaveWithUnsavedCloudChanges()) return;
  await loadCloudTrades();
  renderRoute();
}

function navigateTo(hash) {
  if ((location.hash || "#/") === hash) return;
  if (!confirmLeaveWithUnsavedCloudChanges()) return;
  location.hash = hash;
}

function hasUnsavedCloudTradeChanges(trade = null) {
  if (trade) return state.cloud.dirtyTradeIds.has(trade.id);
  return state.cloud.dirtyTradeIds.size > 0;
}

function confirmLeaveWithUnsavedCloudChanges() {
  if (!hasUnsavedCloudTradeChanges()) return true;
  return confirm(
    "Hay cambios en trades cloud sin subir. Si sales o recargas, se perderán. ¿Continuar sin guardar?",
  );
}

function markCloudTradeDirty(trade) {
  if (!isCloudTrade(trade) || isTradeLocked(trade)) return;
  state.cloud.dirtyTradeIds.add(trade.id);
}

async function saveCurrentCloudTrade() {
  const trade = currentTrade();
  if (!trade || !isCloudTrade(trade)) return;
  if (isTradeLocked(trade)) {
    showToast("El trade está bloqueado. Solicita cambios antes de guardar.");
    return;
  }

  try {
    await window.mtgCloud.saveTrade({
      id: trade.id,
      title: trade.name,
      data: localTradeToCloudData(trade),
    });
    state.cloud.dirtyTradeIds.delete(trade.id);
    await loadCloudTrades(trade.id);
    showToast("Cambios subidos a Supabase.");
    renderTopNavActions({ page: "trade", id: trade.id });
    renderTradePage(trade.id);
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudieron subir los cambios.");
  }
}

async function deleteCloudTrade(trade) {
  if (!isCloudReady() || !isCloudTrade(trade)) return;
  if (trade.createdBy !== state.cloud.user?.id) {
    showToast("Solo el creador puede eliminar este trade cloud.");
    return;
  }
  if (
    !confirm(
      `¿Eliminar el trade "${trade.name}"? Se borrará para todos los participantes.`,
    )
  )
    return;

  try {
    await window.mtgCloud.deleteTrade(trade.id);
    state.cloud.dirtyTradeIds.delete(trade.id);
    await loadCloudTrades();
    showToast("Trade eliminado.");
    if (state.currentTradeId === trade.id) navigateTo("#/");
    else renderRoute();
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo eliminar el trade.");
  }
}

function clearLocalTrades() {
  const localTrades = load(storageKeys.trades, []);
  if (!localTrades.length) {
    showToast("No hay trades locales que borrar.");
    return;
  }
  if (
    !confirm(
      `¿Borrar ${localTrades.length} trade${localTrades.length === 1 ? "" : "s"} local${localTrades.length === 1 ? "" : "es"} de este navegador?`,
    )
  )
    return;
  localStorage.setItem(storageKeys.trades, JSON.stringify([]));
  if (!isCloudReady()) state.trades = [];
  showToast("Trades locales borrados.");
  renderRoute();
}

function localMigrationData() {
  return {
    trades: load(storageKeys.trades, []),
    bulks: load(storageKeys.bulks, []),
    myDeck: normalizeMyDeck(load(storageKeys.myDeck, null)),
  };
}

function localMigrationSummary() {
  const data = localMigrationData();
  return {
    trades: data.trades.length,
    bulks: data.bulks.length,
    hasDeck: Object.keys(data.myDeck.cards ?? {}).length > 0,
  };
}

async function migrateLocalDataToCloud() {
  if (!isCloudReady()) return;
  const data = localMigrationData();
  const summary = localMigrationSummary();
  const total = summary.trades + summary.bulks + (summary.hasDeck ? 1 : 0);
  if (!total) {
    showToast("No hay datos locales que migrar.");
    return;
  }

  const confirmed = confirm(
    `Esto copiará a Supabase los datos locales de este navegador:\n\n${summary.trades} trade${summary.trades === 1 ? "" : "s"}\n${summary.bulks} bulk${summary.bulks === 1 ? "" : "s"}${summary.hasDeck ? "\n1 deck" : ""}\n\nNo se borrarán los datos locales. Si repites la migración, puedes crear duplicados. Los bulks importados se crearán como privados.\n\n¿Continuar?`,
  );
  if (!confirmed) return;

  state.cloud.message = "Migrando datos locales a Supabase…";
  state.cloud.error = "";
  renderRoute();

  try {
    let migratedBulks = 0;
    let migratedDecks = 0;
    let migratedTrades = 0;

    for (const bulk of data.bulks) {
      if (!bulk?.cards || !Object.keys(bulk.cards).length) continue;
      await window.mtgCloud.saveBulk({
        ownerId: state.cloud.user.id,
        name:
          bulk.ownerName || bulk.bulkName || `Bulk local ${migratedBulks + 1}`,
        description: "Importado desde localStorage",
        visibility: "private",
        sourceUrl: bulk.sourceUrl ?? "",
        cards: bulk.cards,
      });
      migratedBulks += 1;
    }

    if (summary.hasDeck) {
      await window.mtgCloud.saveDeck({
        ownerId: state.cloud.user.id,
        name: "Deck local importado",
        description: "Importado desde localStorage",
        visibility: "private",
        sourceUrl: data.myDeck.sourceUrl ?? "",
        cards: data.myDeck.cards,
      });
      migratedDecks = 1;
    }

    for (const trade of data.trades) {
      const cloudData = localTradeToCloudData({
        ...trade,
        currentUserSideKey: "a",
        otherSideKey: "b",
      });
      await window.mtgCloud.createTrade({
        createdBy: state.cloud.user.id,
        title: trade.name || `Trade local ${migratedTrades + 1}`,
        data: cloudData,
      });
      migratedTrades += 1;
    }

    await Promise.all([loadCloudBulks(), loadCloudDecks(), loadCloudTrades()]);
    state.cloud.message = `Migración completada: ${migratedTrades} trade${migratedTrades === 1 ? "" : "s"}, ${migratedBulks} bulk${migratedBulks === 1 ? "" : "s"}${migratedDecks ? " y 1 deck" : ""}.`;
    showToast("Datos locales migrados a Supabase.");
  } catch (error) {
    console.error(error);
    state.cloud.error = error.message || "No se pudo completar la migración.";
  }
  renderRoute();
}

function cloudTradeToLocalTrade(row) {
  const participants = (row.participants ?? []).filter(
    (participant) => !participant.left_at,
  );
  const currentParticipant = participants.find(
    (participant) => participant.user_id === state.cloud.user?.id,
  );
  if (!currentParticipant) return null;

  const mySideKey = currentParticipant.side_key;
  const otherParticipant = participants.find(
    (participant) => participant.user_id !== state.cloud.user.id,
  );
  const otherSideKey =
    otherParticipant?.side_key ?? (mySideKey === "a" ? "b" : "a");
  const data = normalizeCloudTradeData(row.data);
  const mySide = data.sides[mySideKey] ?? defaultCloudTradeSide();
  const otherSide = data.sides[otherSideKey] ?? defaultCloudTradeSide();

  return {
    id: row.id,
    source: "cloud",
    name: row.title,
    code: normalizeTradeCode(data.code || row.title || "CLD"),
    status: row.status,
    createdBy: row.created_by,
    currentUserSideKey: mySideKey,
    otherSideKey,
    participants,
    mineOwnerId: mySide.ownerId ?? "",
    theirOwnerId: otherSide.ownerId ?? "",
    mine: mySide.cards ?? {},
    theirs: otherSide.cards ?? {},
    marks: {
      mine: mySide.marks ?? {},
      theirs: otherSide.marks ?? {},
    },
    removed: {
      mine: mySide.removed ?? {},
      theirs: otherSide.removed ?? {},
    },
    order: {
      mine: mySide.order ?? Object.keys(mySide.cards ?? {}),
      theirs: otherSide.order ?? Object.keys(otherSide.cards ?? {}),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCloudTradeData(data) {
  const normalized = data && typeof data === "object" ? data : {};
  return {
    code: normalized.code ?? "",
    sides: {
      a: { ...defaultCloudTradeSide(), ...(normalized.sides?.a ?? {}) },
      b: { ...defaultCloudTradeSide(), ...(normalized.sides?.b ?? {}) },
    },
  };
}

function defaultCloudTradeSide() {
  return { ownerId: "", cards: {}, marks: {}, removed: {}, order: [] };
}

function localTradeToCloudData(trade) {
  const data = normalizeCloudTradeData({ code: tradeCode(trade) });
  const mySideKey = trade.currentUserSideKey ?? "a";
  const otherSideKey = trade.otherSideKey ?? (mySideKey === "a" ? "b" : "a");
  data.sides[mySideKey] = {
    ownerId: trade.mineOwnerId ?? "",
    cards: trade.mine ?? {},
    marks: trade.marks?.mine ?? {},
    removed: trade.removed?.mine ?? {},
    order: trade.order?.mine ?? Object.keys(trade.mine ?? {}),
  };
  data.sides[otherSideKey] = {
    ownerId: trade.theirOwnerId ?? "",
    cards: trade.theirs ?? {},
    marks: trade.marks?.theirs ?? {},
    removed: trade.removed?.theirs ?? {},
    order: trade.order?.theirs ?? Object.keys(trade.theirs ?? {}),
  };
  return data;
}

function isCloudTrade(trade) {
  return trade?.source === "cloud";
}

function isTradeLocked(trade) {
  return Boolean(
    isCloudTrade(trade) &&
    trade.participants?.some(
      (participant) => participant.acceptance_status === "accepted",
    ),
  );
}

function currentUserTradeAcceptance(trade) {
  return (
    trade?.participants?.find(
      (participant) => participant.user_id === state.cloud.user?.id,
    )?.acceptance_status ?? "pending"
  );
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
  window.addEventListener("hashchange", () => {
    if (suppressHashWarning) {
      suppressHashWarning = false;
      previousRouteHash = location.hash || "#/";
      renderRoute();
      return;
    }
    if (!confirmLeaveWithUnsavedCloudChanges()) {
      suppressHashWarning = true;
      location.hash = previousRouteHash;
      return;
    }
    previousRouteHash = location.hash || "#/";
    renderRoute();
  });

  document.addEventListener("focusin", (event) => {
    if (event.target.matches("[data-search-side]")) {
      renderSearch(event.target.dataset.searchSide, event.target.value);
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-trade-name]")) {
      const trade = currentTrade();
      if (!trade || isTradeLocked(trade)) return;
      trade.name = event.target.value.trim() || "Trade sin nombre";
      saveTrades();
      renderTradeHeader(trade);
      renderTopNavActions({ page: "trade", id: trade.id });
    }

    if (event.target.matches("[data-trade-code]")) {
      const trade = currentTrade();
      if (!trade || isTradeLocked(trade)) return;
      trade.code = normalizeTradeCode(event.target.value);
      event.target.value = trade.code;
      saveTrades();
      renderTopNavActions({ page: "trade", id: trade.id });
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

    if (event.target.matches("#wishlistSearch")) {
      state.wishlistPanel.query = event.target.value;
      renderWishlistPortal({ keepSearchFocus: true });
    }

    if (event.target.matches("[data-wishlist-quantity]")) {
      updateWishlistQuantity(
        event.target.dataset.wishlistQuantity,
        event.target.value,
      );
    }

    if (event.target.matches("#bulkName")) {
      state.bulkDraft.name = event.target.value;
      state.bulkDraft.status = "";
    }

    if (event.target.matches("#bulkOwner")) {
      state.bulkDraft.ownerName = event.target.value;
      state.bulkDraft.status = "";
    }

    if (event.target.matches("#bulkUrl")) {
      state.bulkDraft.sourceUrl = event.target.value;
      state.bulkDraft.status = "";
    }

    if (event.target.matches("#bulkText")) {
      state.bulkDraft.sourceText = event.target.value;
      state.bulkDraft.status = "";
    }

    if (isLiveFilterControl(event.target)) {
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
      if (!trade || isTradeLocked(trade)) return;
      trade[event.target.dataset.ownerSelect] = event.target.value;
      saveTrades();
      renderTradePage(trade.id);
    }

    if (event.target.matches("#cloudDeckSelect")) {
      state.deck.activeDeckId = event.target.value;
      if (event.target.value) {
        syncActiveCloudDeck(event.target.value);
      } else {
        state.myDeck = { cards: {}, sourceUrl: "", updatedAt: "" };
      }
      renderDeckPage();
    }

    if (event.target.matches("#bulkVisibility")) {
      state.bulkDraft.visibility = event.target.value;
      state.bulkDraft.status = "";
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

    if (event.target.matches("#wishlistCatalogFilter")) {
      state.catalog.wishlistFilter = event.target.value;
      state.catalog.page = 1;
      renderCardsPage();
    }

    if (event.target.matches("#catalogMobileColumns")) {
      state.catalog.mobileColumns = Math.max(
        1,
        Math.min(4, Number(event.target.value) || 1),
      );
      renderCardsPage();
    }

    if (event.target.matches("#wishlistGroupBy")) {
      state.wishlistPanel.groupBy = event.target.value;
      renderWishlistPortal();
    }

    if (event.target.matches("#wishlistAvailability")) {
      state.wishlistPanel.availability = event.target.value;
      renderWishlistPortal();
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

    if (isChangeFilterControl(event.target)) {
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
    if (event.target.closest("#cardPreview")) {
      hideCardPreview();
      return;
    }

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

    const routeLink = event.target.closest("a[href^='#/']");
    if (routeLink && !confirmLeaveWithUnsavedCloudChanges()) {
      event.preventDefault();
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
    const preview = event.target.closest("#cardPreview");
    if (preview) {
      if (!event.relatedTarget?.closest?.("#cardPreview")) hideCardPreview();
      return;
    }

    const image = event.target.closest("[data-preview-card] > img");
    const target = image?.closest("[data-preview-card]");
    if (!target) return;
    if (event.relatedTarget?.closest?.("#cardPreview")) return;
    hideCardPreview();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedCloudTradeChanges()) return;
    event.preventDefault();
    event.returnValue = "";
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
    if (!confirmLeaveWithUnsavedCloudChanges()) return;
    const trade = isCloudReady() ? await createCloudTrade() : createTrade();
    if (trade) navigateTo(`#/trade/${trade.id}`);
  }

  if (name === "open-trade") navigateTo(`#/trade/${action.dataset.tradeId}`);

  if (name === "delete-trade") {
    const trade = state.trades.find(
      (item) => item.id === action.dataset.tradeId,
    );
    if (!trade) return;
    if (isCloudTrade(trade)) {
      await deleteCloudTrade(trade);
      return;
    }
    if (!confirm("¿Eliminar este trade?")) return;
    state.trades = state.trades.filter(
      (item) => item.id !== action.dataset.tradeId,
    );
    saveTrades();
    renderHome();
  }

  if (name === "export-data") exportAppData();

  if (name === "import-data")
    document.querySelector("#importDataFile")?.click();

  if (name === "sign-out") {
    if (!confirmLeaveWithUnsavedCloudChanges()) return;
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

  if (name === "invite-cloud-trade-user") {
    await inviteCloudTradeUser();
  }

  if (name === "accept-cloud-trade") {
    await acceptCloudTrade();
  }

  if (name === "request-cloud-trade-changes") {
    await requestCloudTradeChanges();
  }

  if (name === "refresh-cloud-trades") {
    await refreshCloudTrades();
  }

  if (name === "save-cloud-trade") {
    await saveCurrentCloudTrade();
  }

  if (name === "clear-local-trades") {
    clearLocalTrades();
  }

  if (name === "migrate-local-data-to-cloud") {
    await migrateLocalDataToCloud();
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

  if (name === "toggle-filters") {
    toggleFilters(action.dataset.scope);
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

  if (name === "quick-color") {
    toggleQuickColor(action.dataset.scope, action.dataset.color);
  }

  if (name === "toggle-catalog-controls") {
    state.catalog.mobileControlsOpen = !state.catalog.mobileControlsOpen;
    renderCardsPage();
  }

  if (name === "toggle-wishlist-card") {
    toggleWishlistCard(action.dataset.cardId);
  }

  if (name === "toggle-wishlist-panel") {
    state.wishlistPanel.open = !state.wishlistPanel.open;
    renderWishlistPortal();
  }

  if (name === "close-wishlist-panel") {
    state.wishlistPanel.open = false;
    renderWishlistPortal();
  }

  if (name === "toggle-wishlist-group") {
    toggleWishlistGroup(action.dataset.groupKey);
  }

  if (name === "wishlist-add-to-trade") {
    addWishlistCardToTrade(action.dataset.cardId, action.dataset.ownerId);
  }

  if (name === "wishlist-create-trade") {
    await createTradeFromWishlistOwner(action.dataset.ownerId);
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

  if (name === "delete-cloud-deck") {
    await deleteCloudDeck(action.dataset.deckId);
  }

  if (name === "refresh-cloud-decks") {
    await refreshCloudDecks();
  }

  if (name === "update-bulk-from-url") {
    await updateBulkFromUrl(action.dataset.bulkId);
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
  syncOpenFiltersForRoute(current.page);
  if (current.page !== "trade") {
    state.tradeEditorOpen = false;
    state.captureExpanded = false;
  }
  renderTopNavActions(current);
  renderUserNavStatus();
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
  else if (current.page === "user") renderUserPage();
  else if (current.page === "privacy") renderPrivacyPage();
  else if (current.page === "terms") renderTermsPage();
  else if (current.page === "trade" && current.id) renderTradePage(current.id);
  else renderHome();
  renderFilterPortal();
  renderWishlistPortal();
}

function syncOpenFiltersForRoute(page) {
  const allowed =
    page === "cards"
      ? ["catalog"]
      : page === "deck"
        ? ["deck"]
        : page === "trade"
          ? ["mine", "theirs"]
          : [];
  filterScopes.forEach((scope) => {
    if (!allowed.includes(scope)) state.openFilters[scope] = false;
  });
  syncBodyScrollLock();
}

function renderUserNavStatus() {
  if (!userNavLink) return;
  const signedIn = Boolean(state.cloud.user && state.cloud.profile);
  userNavLink.classList.toggle("is-signed-in", signedIn);
  userNavLink.title = signedIn
    ? `Usuario: @${state.cloud.profile?.username ?? ""}`
    : "Usuario: sin sesión";
  userNavLink.setAttribute(
    "aria-label",
    signedIn ? "Usuario con sesión iniciada" : "Usuario sin sesión",
  );
}

function renderTopNavActions(current = route()) {
  if (!topNavActions) return;
  if (current.page !== "trade" || !current.id) {
    topNavActions.innerHTML = "";
    return;
  }
  const trade = state.trades.find((item) => item.id === current.id);
  const saveButton = hasUnsavedCloudTradeChanges(trade)
    ? `<button class="button nav-edit-button" type="button" data-action="save-cloud-trade" title="Subir cambios a Supabase" aria-label="Subir cambios">Subir</button>`
    : "";
  topNavActions.innerHTML = `${saveButton}<button class="ghost-button nav-edit-button icon-only" type="button" data-action="share-trade" title="Copiar enlace para compartir" aria-label="Compartir trade"><span aria-hidden="true">🔗</span></button><button class="ghost-button nav-edit-button icon-only ${state.tradeEditorOpen ? "is-active" : ""}" type="button" data-action="toggle-trade-editor" title="Editar trade" aria-label="Editar trade"><span aria-hidden="true">✎</span></button>`;
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

function renderAdvancedFilters(scope) {
  const filters = filtersForScope(scope);
  return `
    <div class="filter-header-row">
      <button class="ghost-button filter-toggle ${filtersAreActive(filters) ? "has-active-filters" : ""}" type="button" data-action="toggle-filters" data-scope="${scope}" aria-expanded="${state.openFilters[scope] ? "true" : "false"}">Filtros</button>
      ${renderQuickSynergyFilters(scope)}
    </div>
  `;
}

function renderFilterPortal(focusFilter = null) {
  const portal = ensureFilterPortal();
  const scope = filterScopes.find((item) => state.openFilters[item]);
  if (!scope) {
    portal.innerHTML = "";
    portal.hidden = true;
    return;
  }

  const filters = filtersForScope(scope);
  portal.hidden = false;
  portal.innerHTML = `
    <button class="advanced-backdrop" type="button" data-action="close-filters" data-scope="${scope}" aria-label="Cerrar filtros"></button>
    <div class="advanced-popup" data-filter-panel data-scope="${scope}" role="dialog" aria-modal="true" aria-label="Filtros avanzados">
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
          scope === "catalog"
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
  `;

  if (focusFilter?.scope === scope) {
    const filterInput = portal.querySelector(
      `[data-filter][data-scope='${scope}'][data-field='${focusFilter.field}']`,
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

function ensureFilterPortal() {
  let portal = document.querySelector("#filterPortal");
  if (!portal) {
    portal = document.createElement("div");
    portal.id = "filterPortal";
    portal.className = "filter-portal";
    portal.hidden = true;
    document.body.appendChild(portal);
  }
  return portal;
}

function renderWishlistPortal(options = {}) {
  const portal = ensureWishlistPortal();
  const current = route();
  if (!wishlistRoutes().includes(current.page)) {
    portal.innerHTML = "";
    portal.hidden = true;
    return;
  }

  const total = wishlistCardIds().length;
  portal.hidden = false;
  portal.innerHTML = `
    <button class="wishlist-tab ${state.wishlistPanel.open ? "is-open" : ""}" type="button" data-action="toggle-wishlist-panel" title="Abrir wishlist" aria-label="Abrir wishlist" aria-expanded="${state.wishlistPanel.open ? "true" : "false"}">
      <img src="assets/icons/wishlist-toggle.svg" alt="" aria-hidden="true" />
      ${total ? `<span>${total}</span>` : ""}
    </button>
    <aside class="wishlist-panel ${state.wishlistPanel.open ? "is-open" : ""}" aria-hidden="${state.wishlistPanel.open ? "false" : "true"}" aria-label="Wishlist">
      ${renderWishlistPanel()}
    </aside>
  `;

  if (options.keepSearchFocus) {
    const searchInput = portal.querySelector("#wishlistSearch");
    searchInput?.focus();
    searchInput?.setSelectionRange(
      searchInput.value.length,
      searchInput.value.length,
    );
  }
}

function ensureWishlistPortal() {
  let portal = document.querySelector("#wishlistPortal");
  if (!portal) {
    portal = document.createElement("div");
    portal.id = "wishlistPortal";
    portal.className = "wishlist-portal";
    portal.hidden = true;
    document.body.appendChild(portal);
  }
  return portal;
}

function wishlistRoutes() {
  return ["cards", "trade"];
}

function renderWishlistPanel() {
  const groups = wishlistGroups();
  const total = wishlistCardIds().length;
  return `
    <div class="wishlist-panel-header">
      <div>
        <p class="eyebrow">Wishlist</p>
        <h3>${total} carta${total === 1 ? "" : "s"}</h3>
      </div>
      <button class="ghost-button" type="button" data-action="close-wishlist-panel" title="Cerrar wishlist" aria-label="Cerrar wishlist">Cerrar</button>
    </div>
    <div class="wishlist-controls">
      <label>Buscar
        <input id="wishlistSearch" type="search" value="${escapeHtml(state.wishlistPanel.query)}" placeholder="Nombre, tipo, texto…" />
      </label>
      <label>Agrupar
        <select id="wishlistGroupBy">
          <option value="owner" ${state.wishlistPanel.groupBy === "owner" ? "selected" : ""}>Persona / bulk</option>
          <option value="card" ${state.wishlistPanel.groupBy === "card" ? "selected" : ""}>Carta</option>
          <option value="availability" ${state.wishlistPanel.groupBy === "availability" ? "selected" : ""}>Disponibilidad</option>
        </select>
      </label>
      <label>Ver
        <select id="wishlistAvailability">
          <option value="all" ${state.wishlistPanel.availability === "all" ? "selected" : ""}>Todas</option>
          <option value="available" ${state.wishlistPanel.availability === "available" ? "selected" : ""}>Con stock</option>
          <option value="missing" ${state.wishlistPanel.availability === "missing" ? "selected" : ""}>Sin dueño</option>
        </select>
      </label>
    </div>
    <div class="wishlist-list">
      ${groups.length ? groups.map(renderWishlistGroup).join("") : `<div class="empty-state">No hay cartas en wishlist con estos filtros.</div>`}
    </div>
  `;
}

function renderWishlistGroup(group) {
  const collapsed = Boolean(state.wishlistPanel.collapsedGroups[group.key]);
  const canCreateTrade = Boolean(group.ownerId && group.items.length);
  return `
    <section class="wishlist-group ${collapsed ? "is-collapsed" : ""}">
      <div class="wishlist-group-header">
        <button class="wishlist-group-toggle" type="button" data-action="toggle-wishlist-group" data-group-key="${escapeHtml(group.key)}" aria-expanded="${collapsed ? "false" : "true"}">
          <span aria-hidden="true">${collapsed ? "▸" : "▾"}</span>
          <strong>${escapeHtml(group.title)}</strong>
          <em>${group.items.length}</em>
        </button>
        ${canCreateTrade ? `<button class="ghost-button wishlist-create-trade" type="button" data-action="wishlist-create-trade" data-owner-id="${escapeHtml(group.ownerId)}" title="Crear trade con ${escapeHtml(group.title)}">Crear trade</button>` : ""}
      </div>
      ${collapsed ? "" : `<div class="wishlist-group-body">${group.items.map(renderWishlistItem).join("")}</div>`}
    </section>
  `;
}

function renderWishlistItem(item) {
  const card = item.card;
  const owners = item.owners ?? wishlistOwnersForCard(card.id);
  const primaryOwner = item.owner ?? owners[0] ?? null;
  const ownerId = primaryOwner?.id ?? "";
  const stock = primaryOwner
    ? (primaryOwner.cards[card.id] ?? 0)
    : availableCopies(card.id);
  const rarity = rarityConfig[card.rarity] ?? rarityConfig.common;
  const inTrade = route().page === "trade";
  const trade = currentTrade();
  const canAddToTrade = inTrade && !isTradeLocked(trade) && stock > 0;
  const availability = item.owner
    ? `${item.owner.ownerName} ×${item.owner.cards[card.id] ?? 0}`
    : owners.length
      ? owners
          .map((owner) => `${owner.ownerName} ×${owner.cards[card.id] ?? 0}`)
          .join(" · ")
      : "Sin dueño";
  return `
    <article class="wishlist-card" data-preview-card="${card.id}">
      ${renderImage(card)}
      <div>
        <div class="wishlist-card-title">${renderTypeIcon(card.typeCategory)}${escapeHtml(card.name)}</div>
        <div class="card-meta">${renderManaCost(card.manaCost)} ${renderRarityIcon(card.rarity)} ${card.setCode} #${card.collectorNumber} · ${rarity.label}</div>
        <div class="muted small">${escapeHtml(availability)}</div>
        <div class="wishlist-card-actions">
          <label class="wishlist-qty-label">Qty
            <input type="number" min="1" max="99" data-wishlist-quantity="${card.id}" value="${item.quantity}" aria-label="Cantidad deseada de ${escapeHtml(card.name)}" />
          </label>
          ${canAddToTrade ? `<button class="button" type="button" data-action="wishlist-add-to-trade" data-card-id="${card.id}" data-owner-id="${escapeHtml(ownerId)}" title="Añadir a Sus cartas">+ Sus cartas</button>` : ""}
          <button class="ghost-button wishlist-card-button is-active" type="button" data-action="toggle-wishlist-card" data-card-id="${card.id}" title="Quitar de wishlist" aria-label="Quitar ${escapeHtml(card.name)} de wishlist"><span class="wishlist-bookmark-icon" aria-hidden="true"></span></button>
        </div>
      </div>
    </article>
  `;
}

function wishlistGroups() {
  const entries = wishlistEntries();
  if (state.wishlistPanel.groupBy === "card") {
    return entries.map((entry) => ({
      key: `card:${entry.card.id}`,
      title: entry.card.name,
      items: [entry],
    }));
  }

  if (state.wishlistPanel.groupBy === "availability") {
    const available = entries.filter((entry) => entry.owners.length);
    const missing = entries.filter((entry) => !entry.owners.length);
    return [
      { key: "availability:available", title: "Con stock", items: available },
      { key: "availability:missing", title: "Sin dueño", items: missing },
    ].filter((group) => group.items.length);
  }

  const groups = new Map();
  entries.forEach((entry) => {
    if (!entry.owners.length) {
      const key = "owner:missing";
      if (!groups.has(key))
        groups.set(key, { key, title: "Sin dueño", items: [] });
      groups.get(key).items.push(entry);
      return;
    }

    entry.owners.forEach((owner) => {
      const key = `owner:${owner.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: owner.ownerName || "Sin persona",
          ownerId: owner.id,
          items: [],
        });
      }
      groups.get(key).items.push({ ...entry, owner });
    });
  });
  return [...groups.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "es"),
  );
}

function wishlistEntries({ applyFilters = true } = {}) {
  const query = applyFilters ? state.wishlistPanel.query.trim() : "";
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const availability = applyFilters ? state.wishlistPanel.availability : "all";
  return wishlistCardIds()
    .map((cardId) => {
      const card = getCard(cardId);
      if (!card) return null;
      const entry = state.wishlist.cards[cardId] ?? {};
      const owners = wishlistOwnersForCard(cardId);
      return {
        card,
        quantity: Math.max(1, Number(entry.quantity) || 1),
        owners,
      };
    })
    .filter(Boolean)
    .filter((entry) => {
      if (terms.length) {
        const searchable =
          entry.card.normalizedSearchable ||
          normalizeSearchText(entry.card.searchable);
        if (!terms.every((term) => searchable.includes(term))) return false;
      }
      if (availability === "available" && !entry.owners.length) return false;
      if (availability === "missing" && entry.owners.length) return false;
      return true;
    })
    .sort((a, b) => a.card.name.localeCompare(b.card.name, "es"));
}

function wishlistOwnersForCard(cardId) {
  return state.bulks.filter((bulk) => (bulk.cards?.[cardId] ?? 0) > 0);
}

function wishlistCardIds() {
  return Object.keys(state.wishlist.cards ?? {});
}

function isWishlisted(cardId) {
  return Boolean(state.wishlist.cards?.[cardId]);
}

function toggleWishlistCard(cardId) {
  if (!cardId) return;
  state.wishlist.cards ??= {};
  if (state.wishlist.cards[cardId]) delete state.wishlist.cards[cardId];
  else {
    state.wishlist.cards[cardId] = {
      quantity: 1,
      createdAt: new Date().toISOString(),
    };
  }
  saveWishlist();
  renderWishlistAwareRoute();
}

function updateWishlistQuantity(cardId, value) {
  if (!cardId || !state.wishlist.cards?.[cardId]) return;
  const quantity = Math.max(1, Math.min(99, Number(value) || 1));
  state.wishlist.cards[cardId].quantity = quantity;
  saveWishlist();
}

function toggleWishlistGroup(groupKey) {
  if (!groupKey) return;
  state.wishlistPanel.collapsedGroups[groupKey] =
    !state.wishlistPanel.collapsedGroups[groupKey];
  renderWishlistPortal();
}

function addWishlistCardToTrade(cardId, ownerId = "") {
  const trade = currentTrade();
  if (!trade || isTradeLocked(trade) || !cardId) return;
  const entry = state.wishlist.cards?.[cardId];
  const owners = wishlistOwnersForCard(cardId);
  const selectedOwnerId = ownerId || owners[0]?.id || "";
  const owner = state.bulks.find((bulk) => bulk.id === selectedOwnerId);
  const stock = owner ? (owner.cards[cardId] ?? 0) : availableCopies(cardId);
  if (stock <= 0) return;
  const quantity = Math.min(Math.max(1, Number(entry?.quantity) || 1), stock);
  ensureTradeMarks(trade);
  ensureTradeRemoved(trade);
  ensureTradeOrder(trade);
  if (selectedOwnerId && !trade.theirOwnerId)
    trade.theirOwnerId = selectedOwnerId;
  trade.theirs[cardId] = (trade.theirs[cardId] ?? 0) + quantity;
  if (!trade.order.theirs.includes(cardId)) trade.order.theirs.push(cardId);
  touchTrade(trade);
  showToast(`${quantity} añadida${quantity === 1 ? "" : "s"} a Sus cartas`);
  renderTradePage(trade.id);
}

async function createTradeFromWishlistOwner(ownerId) {
  const owner = state.bulks.find((bulk) => bulk.id === ownerId);
  if (!owner) return;
  const entries = wishlistEntries({ applyFilters: false }).filter(
    (entry) => (owner.cards[entry.card.id] ?? 0) > 0,
  );
  if (!entries.length) return;

  const trade = isCloudReady() ? await createCloudTrade() : createTrade();
  if (!trade) return;
  trade.name = `Trade con ${owner.ownerName || "wishlist"}`;
  trade.theirOwnerId = owner.id;
  ensureTradeMarks(trade);
  ensureTradeRemoved(trade);
  ensureTradeOrder(trade);
  entries.forEach((entry) => {
    const cardId = entry.card.id;
    const quantity = Math.min(entry.quantity, owner.cards[cardId] ?? 0);
    if (quantity <= 0) return;
    trade.theirs[cardId] = (trade.theirs[cardId] ?? 0) + quantity;
    if (!trade.order.theirs.includes(cardId)) trade.order.theirs.push(cardId);
  });
  touchTrade(trade);
  state.wishlistPanel.open = true;
  location.hash = `#/trade/${trade.id}`;
  renderRoute();
}

function renderWishlistAwareRoute() {
  const current = route();
  if (current.page === "cards") renderCardsPage();
  else if (current.page === "trade" && current.id) renderTradePage(current.id);
  else renderWishlistPortal();
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
    <div class="quick-color-toggle" aria-label="Filtrar por colores">
      ${colorConfig.map((color) => `<button class="ghost-button quick-color-button ${filters.colors.includes(color.value) ? "is-active" : ""}" type="button" data-action="quick-color" data-scope="${scope}" data-color="${color.value}" title="Filtrar ${color.title}" aria-label="Filtrar ${color.title}"><img class="mana-icon" src="assets/icons/${color.icon}" alt="${color.title}" /></button>`).join("")}
    </div>
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

function isLiveFilterControl(control) {
  return (
    control.matches?.("[data-filter]") &&
    control.tagName !== "SELECT" &&
    control.type !== "checkbox"
  );
}

function isChangeFilterControl(control) {
  return (
    control.matches?.("[data-filter]") &&
    (control.tagName === "SELECT" || control.type === "checkbox")
  );
}

function updateFilterFromControl(control) {
  const scope = control.dataset.scope;
  const field = control.dataset.field;
  const filters = filtersForScope(scope);
  if (!filters || !field) return;

  if (control.closest("[data-filter-panel]")) {
    state.openFilters[scope] = true;
    syncBodyScrollLock();
  }

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

function toggleFilters(scope) {
  const nextOpen = !state.openFilters[scope];
  filterScopes.forEach((item) => {
    state.openFilters[item] = item === scope ? nextOpen : false;
  });
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

  if (state.activeSynergy[scope] === synergyName) {
    filters.colors = [];
    filters.colorMode = "all";
    state.activeSynergy[scope] = "";
  } else {
    filters.colors = colorsValue.split("");
    filters.colorMode = "any";
    state.activeSynergy[scope] = synergyName;
  }

  renderFilteredScope(scope);
}

function toggleQuickColor(scope, color) {
  const filters = filtersForScope(scope);
  if (!filters || !color) return;
  filters.colors = filters.colors.includes(color)
    ? filters.colors.filter((item) => item !== color)
    : [...filters.colors, color];
  filters.colorMode = filters.colors.length ? "any" : "all";
  state.activeSynergy[scope] = "";
  renderFilteredScope(scope);
}

function renderFilteredScope(scope) {
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
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const ownerInventory = ownerInventoryForFilter(ownerId);
  return cards.filter((card) => {
    const searchable =
      card.normalizedSearchable || normalizeSearchText(card.searchable);
    if (terms.length && !terms.every((term) => searchable.includes(term)))
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
    if (filters.oracle && !includesNormalized(card.oracle, filters.oracle))
      return false;
    if (filters.type && !includesNormalized(card.typeLine, filters.type))
      return false;
    if (filters.rarity && card.rarity !== filters.rarity) return false;
    if (
      filters.manaCost &&
      !includesNormalized(card.manaCost, filters.manaCost)
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
    .replace(/\s+#?\d+[a-z]?$/i, "")
    .replace(/\s+\([A-Z0-9]{2,8}\)$/i, "")
    .replace(/\s+\[[A-Z0-9]{2,8}\]$/i, "")
    .replace(/\s+#?\d+[a-z]?$/i, "")
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

async function createCloudTrade() {
  if (!isCloudReady()) return null;
  const index = state.trades.length + 1;
  const title = `Trade ${index}`;
  const data = normalizeCloudTradeData({
    code: defaultTradeCode(index),
    sides: {
      a: defaultCloudTradeSide(),
      b: defaultCloudTradeSide(),
    },
  });

  try {
    const id = await window.mtgCloud.createTrade({
      createdBy: state.cloud.user.id,
      title,
      data,
    });
    await loadCloudTrades(id);
    return state.trades.find((trade) => trade.id === id) ?? null;
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo crear el trade en la nube.");
    return null;
  }
}

async function inviteCloudTradeUser() {
  const trade = currentTrade();
  const input = document.querySelector("#cloudTradeUsername");
  const username = normalizeUsername(input?.value ?? "");
  if (!trade || !isCloudTrade(trade) || !username) return;
  if (trade.createdBy !== state.cloud.user?.id) {
    showToast("Solo el creador puede invitar usuarios por ahora.");
    return;
  }
  if (
    trade.participants?.some(
      (participant) => participant.profile?.username === username,
    )
  ) {
    showToast("Ese usuario ya está vinculado al trade.");
    return;
  }

  try {
    const profile = await window.mtgCloud.findProfileByUsername(username);
    if (!profile) {
      showToast("No existe ningún usuario con ese username.");
      return;
    }
    if (profile.id === state.cloud.user.id) {
      showToast("No puedes invitarte a ti mismo.");
      return;
    }
    const usedSides = new Set(
      trade.participants.map((participant) => participant.side_key),
    );
    const sideKey = usedSides.has("a") ? "b" : "a";
    await window.mtgCloud.addTradeParticipant({
      tradeId: trade.id,
      userId: profile.id,
      sideKey,
    });
    await loadCloudTrades(trade.id);
    showToast(`@${username} vinculado al trade.`);
    renderTradePage(trade.id);
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo vincular el usuario.");
  }
}

async function acceptCloudTrade() {
  const trade = currentTrade();
  if (!trade || !isCloudTrade(trade)) return;
  if (hasUnsavedCloudTradeChanges(trade)) {
    showToast("Sube los cambios antes de aceptar el trade.");
    return;
  }
  try {
    await window.mtgCloud.acceptTrade(trade.id, state.cloud.user.id);
    await loadCloudTrades(trade.id);
    showToast("Trade aceptado. Queda bloqueado hasta solicitar cambios.");
    renderTradePage(trade.id);
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo aceptar el trade.");
  }
}

async function requestCloudTradeChanges() {
  const trade = currentTrade();
  if (!trade || !isCloudTrade(trade)) return;
  try {
    await window.mtgCloud.requestTradeChanges(trade.id);
    await loadCloudTrades(trade.id);
    showToast("Cambios solicitados. El trade vuelve a estar editable.");
    renderTradePage(trade.id);
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo solicitar cambios.");
  }
}

function currentTrade() {
  return (
    state.trades.find((trade) => trade.id === state.currentTradeId) ?? null
  );
}

function addCard(side, cardId) {
  const trade = currentTrade();
  if (!trade || isTradeLocked(trade)) return;
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
  if (!trade || isTradeLocked(trade)) return;
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
  if (!trade || isTradeLocked(trade)) return;
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
  if (
    !trade ||
    isTradeLocked(trade) ||
    !["priority", "residual"].includes(mark)
  )
    return;
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
  if (!trade || isTradeLocked(trade)) return;
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
  if (!trade || isTradeLocked(trade) || draggedCardId === targetCardId) return;
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
  if (!trade || isTradeLocked(trade)) return;
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
    normalizedSearchable: normalizeSearchText(searchable),
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
  if (isCloudTrade(trade)) {
    markCloudTradeDirty(trade);
    return;
  }
  saveTrades();
}

function saveTrades() {
  if (isCloudReady()) {
    const trade = currentTrade();
    if (isCloudTrade(trade)) markCloudTradeDirty(trade);
    return;
  }
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

function saveWishlist() {
  localStorage.setItem(storageKeys.wishlist, JSON.stringify(state.wishlist));
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
    wishlist: state.wishlist,
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
  const wishlistCount = Object.keys(
    normalizeWishlist(data.wishlist).cards,
  ).length;
  const confirmed = confirm(
    `Esto reemplazará los datos guardados en este navegador por el backup:\n\n${tradeCount} trade${tradeCount === 1 ? "" : "s"}\n${bulkCount} persona${bulkCount === 1 ? "" : "s"} / bulk${bulkCount === 1 ? "" : "s"}\n${wishlistCount} carta${wishlistCount === 1 ? "" : "s"} en wishlist\n\n¿Continuar?`,
  );
  if (!confirmed) return;

  state.trades = data.trades;
  state.bulks = data.bulks;
  state.myDeck = normalizeMyDeck(data.myDeck);
  state.wishlist = normalizeWishlist(data.wishlist);
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
  saveWishlist();
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
    (!data.wishlist || typeof data.wishlist === "object") &&
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

function normalizeWishlist(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawCards =
    source.cards && typeof source.cards === "object" ? source.cards : source;
  const cards = {};
  Object.entries(rawCards).forEach(([cardId, value]) => {
    if (!cardId) return;
    if (value && typeof value === "object") {
      cards[cardId] = {
        quantity: Math.max(1, Number(value.quantity) || 1),
        createdAt: value.createdAt ?? new Date().toISOString(),
      };
    } else if (value) {
      cards[cardId] = { quantity: 1, createdAt: new Date().toISOString() };
    }
  });
  return { cards };
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
  return normalizeSearchText(String(value ?? "").replace(/\/\/.*$/, ""));
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9{}]+/g, " ")
    .trim();
}

function includesNormalized(value, query) {
  return normalizeSearchText(value).includes(normalizeSearchText(query));
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
