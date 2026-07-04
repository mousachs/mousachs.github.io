(() => {
  const profileFields =
    "id, username, display_name, avatar_url, created_at, updated_at";
  const config = window.MTG_SUPABASE_CONFIG ?? {};
  const hasConfig =
    typeof config.url === "string" &&
    config.url.startsWith("https://") &&
    typeof config.anonKey === "string" &&
    config.anonKey.length > 20;
  let client = null;

  function getClient() {
    if (client) return client;
    if (!hasConfig) return null;
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS no está cargado.");
    }
    client = window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
    return client;
  }

  async function getSession() {
    const supabase = getClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  function onAuthStateChange(callback) {
    const supabase = getClient();
    if (!supabase) return null;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
    return data?.subscription ?? null;
  }

  async function signInWithEmail(email) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    });
    if (error) throw error;
  }

  async function signOut() {
    const supabase = getClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function getProfile(userId) {
    const supabase = getClient();
    if (!supabase || !userId) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select(profileFields)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function saveProfile(userId, username, displayName) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const profile = {
      id: userId,
      username,
      display_name: displayName || username,
    };
    const { data, error } = await supabase
      .from("profiles")
      .upsert(profile, { onConflict: "id" })
      .select(profileFields)
      .single();
    if (error) throw error;
    return data;
  }

  async function fetchBulks(currentUserId) {
    const supabase = getClient();
    if (!supabase) return [];

    const { data: bulkRows, error: bulksError } = await supabase
      .from("bulks")
      .select(
        "id, owner_id, name, description, visibility, source_url, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (bulksError) throw bulksError;
    if (!bulkRows?.length) return [];

    const ownerIds = [...new Set(bulkRows.map((bulk) => bulk.owner_id))];
    const bulkIds = bulkRows.map((bulk) => bulk.id);

    const [
      { data: profileRows, error: profilesError },
      { data: cardRows, error: cardsError },
    ] = await Promise.all([
      supabase.from("profiles").select(profileFields).in("id", ownerIds),
      supabase
        .from("bulk_cards")
        .select("bulk_id, card_id, quantity")
        .in("bulk_id", bulkIds),
    ]);

    if (profilesError) throw profilesError;
    if (cardsError) throw cardsError;

    const profilesById = new Map(
      (profileRows ?? []).map((profile) => [profile.id, profile]),
    );
    const cardsByBulkId = new Map();
    (cardRows ?? []).forEach((row) => {
      const cards = cardsByBulkId.get(row.bulk_id) ?? {};
      cards[row.card_id] = (cards[row.card_id] ?? 0) + row.quantity;
      cardsByBulkId.set(row.bulk_id, cards);
    });

    return bulkRows.map((bulk) => {
      const profile = profilesById.get(bulk.owner_id);
      const username = profile?.username ?? "usuario";
      const displayName = profile?.display_name ?? username;
      return {
        id: bulk.id,
        ownerId: bulk.owner_id,
        ownerName: `@${username} / ${bulk.name}`,
        bulkName: bulk.name,
        profileUsername: username,
        profileDisplayName: displayName,
        visibility: bulk.visibility,
        sourceUrl: bulk.source_url ?? "",
        description: bulk.description ?? "",
        cards: cardsByBulkId.get(bulk.id) ?? {},
        createdAt: bulk.created_at,
        updatedAt: bulk.updated_at,
        source: "cloud",
        canEdit: bulk.owner_id === currentUserId,
      };
    });
  }

  async function saveBulk(input) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");

    const row = {
      id: input.id || undefined,
      owner_id: input.ownerId,
      name: input.name,
      description: input.description || null,
      visibility: input.visibility || "public",
      source_url: input.sourceUrl || null,
    };

    const { data: bulk, error: bulkError } = await supabase
      .from("bulks")
      .upsert(row)
      .select("id")
      .single();
    if (bulkError) throw bulkError;

    const { error: deleteError } = await supabase
      .from("bulk_cards")
      .delete()
      .eq("bulk_id", bulk.id);
    if (deleteError) throw deleteError;

    const cardRows = Object.entries(input.cards ?? {})
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([cardId, quantity]) => ({
        bulk_id: bulk.id,
        card_id: cardId,
        quantity: Number(quantity),
      }));

    if (cardRows.length) {
      const { error: insertError } = await supabase
        .from("bulk_cards")
        .insert(cardRows);
      if (insertError) throw insertError;
    }

    return bulk.id;
  }

  async function deleteBulk(bulkId) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase.from("bulks").delete().eq("id", bulkId);
    if (error) throw error;
  }

  async function fetchManaBoxDeck(url) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { data, error } = await supabase.functions.invoke("manabox-bulk", {
      body: { url },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function fetchDecks(currentUserId) {
    const supabase = getClient();
    if (!supabase) return [];

    const { data: deckRows, error: decksError } = await supabase
      .from("decks")
      .select(
        "id, owner_id, name, description, visibility, share_token, source_url, created_at, updated_at",
      )
      .eq("owner_id", currentUserId)
      .order("updated_at", { ascending: false });
    if (decksError) throw decksError;
    if (!deckRows?.length) return [];

    const deckIds = deckRows.map((deck) => deck.id);
    const { data: cardRows, error: cardsError } = await supabase
      .from("deck_cards")
      .select("deck_id, card_id, quantity, section")
      .in("deck_id", deckIds);
    if (cardsError) throw cardsError;

    const cardsByDeckId = new Map();
    (cardRows ?? []).forEach((row) => {
      const cards = cardsByDeckId.get(row.deck_id) ?? {};
      cards[row.card_id] = (cards[row.card_id] ?? 0) + row.quantity;
      cardsByDeckId.set(row.deck_id, cards);
    });

    return deckRows.map((deck) => ({
      id: deck.id,
      ownerId: deck.owner_id,
      name: deck.name,
      description: deck.description ?? "",
      visibility: deck.visibility,
      shareToken: deck.share_token ?? "",
      sourceUrl: deck.source_url ?? "",
      cards: cardsByDeckId.get(deck.id) ?? {},
      createdAt: deck.created_at,
      updatedAt: deck.updated_at,
      source: "cloud",
      canEdit: deck.owner_id === currentUserId,
    }));
  }

  async function saveDeck(input) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");

    const row = {
      id: input.id || undefined,
      owner_id: input.ownerId,
      name: input.name,
      description: input.description || null,
      visibility: input.visibility || "private",
      source_url: input.sourceUrl || null,
    };

    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .upsert(row)
      .select("id")
      .single();
    if (deckError) throw deckError;

    const { error: deleteError } = await supabase
      .from("deck_cards")
      .delete()
      .eq("deck_id", deck.id);
    if (deleteError) throw deleteError;

    const cardRows = Object.entries(input.cards ?? {})
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([cardId, quantity]) => ({
        deck_id: deck.id,
        card_id: cardId,
        quantity: Number(quantity),
        section: "main",
      }));

    if (cardRows.length) {
      const { error: insertError } = await supabase
        .from("deck_cards")
        .insert(cardRows);
      if (insertError) throw insertError;
    }

    return deck.id;
  }

  async function deleteDeck(deckId) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase.from("decks").delete().eq("id", deckId);
    if (error) throw error;
  }

  async function findProfileByUsername(username) {
    const supabase = getClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select(profileFields)
      .eq("username", username)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function fetchTrades(currentUserId) {
    const supabase = getClient();
    if (!supabase) return [];

    const { data: tradeRows, error: tradesError } = await supabase
      .from("trades")
      .select("id, created_by, title, status, data, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (tradesError) throw tradesError;
    if (!tradeRows?.length) return [];

    const tradeIds = tradeRows.map((trade) => trade.id);
    const { data: participantRows, error: participantsError } = await supabase
      .from("trade_participants")
      .select(
        "trade_id, user_id, side_key, role, acceptance_status, accepted_at, left_at, created_at, updated_at",
      )
      .in("trade_id", tradeIds);
    if (participantsError) throw participantsError;

    const profileIds = [
      ...new Set(
        (participantRows ?? []).map((participant) => participant.user_id),
      ),
    ];
    const { data: profileRows, error: profilesError } = profileIds.length
      ? await supabase
          .from("profiles")
          .select(profileFields)
          .in("id", profileIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;

    const profilesById = new Map(
      (profileRows ?? []).map((profile) => [profile.id, profile]),
    );
    const participantsByTradeId = new Map();
    (participantRows ?? []).forEach((participant) => {
      const participants =
        participantsByTradeId.get(participant.trade_id) ?? [];
      participants.push({
        ...participant,
        profile: profilesById.get(participant.user_id) ?? null,
        isCurrentUser: participant.user_id === currentUserId,
      });
      participantsByTradeId.set(participant.trade_id, participants);
    });

    return tradeRows.map((trade) => ({
      ...trade,
      participants: participantsByTradeId.get(trade.id) ?? [],
    }));
  }

  async function createTrade(input) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { data, error } = await supabase.rpc("create_trade_with_owner", {
      p_title: input.title,
      p_data: input.data,
    });
    if (error) throw error;
    return data;
  }

  async function saveTrade(input) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase
      .from("trades")
      .update({ title: input.title, data: input.data })
      .eq("id", input.id);
    if (error) throw error;
  }

  async function deleteTrade(tradeId) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase.from("trades").delete().eq("id", tradeId);
    if (error) throw error;
  }

  async function addTradeParticipant(input) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase.from("trade_participants").insert({
      trade_id: input.tradeId,
      user_id: input.userId,
      side_key: input.sideKey,
      role: "participant",
    });
    if (error) throw error;
  }

  async function acceptTrade(tradeId, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase
      .from("trade_participants")
      .update({
        acceptance_status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("trade_id", tradeId)
      .eq("user_id", userId);
    if (error) throw error;
  }

  async function requestTradeChanges(tradeId) {
    const supabase = getClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase
      .from("trade_participants")
      .update({ acceptance_status: "pending", accepted_at: null })
      .eq("trade_id", tradeId);
    if (error) throw error;
  }

  window.mtgCloud = {
    acceptTrade,
    addTradeParticipant,
    createTrade,
    deleteBulk,
    deleteDeck,
    deleteTrade,
    fetchBulks,
    fetchDecks,
    fetchManaBoxDeck,
    fetchTrades,
    findProfileByUsername,
    getClient,
    getProfile,
    getSession,
    isConfigured: () => hasConfig,
    onAuthStateChange,
    requestTradeChanges,
    saveBulk,
    saveDeck,
    saveProfile,
    saveTrade,
    signInWithEmail,
    signOut,
  };
})();
