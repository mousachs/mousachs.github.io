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

  window.mtgCloud = {
    getClient,
    getProfile,
    getSession,
    isConfigured: () => hasConfig,
    onAuthStateChange,
    saveProfile,
    signInWithEmail,
    signOut,
  };
})();
