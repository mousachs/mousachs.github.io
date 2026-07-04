function renderUserPage() {
  app.innerHTML = `
    <section class="stack">
      <div>
        <p class="eyebrow">Usuario</p>
        <h2>Cuenta y datos</h2>
      </div>
      ${renderCloudPanel()}
      ${renderThemePanel()}
      ${renderUserDataPanel()}
    </section>
  `;
}

function renderThemePanel() {
  const selectedTheme = normalizeTheme(state.settings.theme);
  return `
    <div class="panel stack">
      <div>
        <p class="eyebrow">Apariencia</p>
        <h3>Theme</h3>
        <p class="muted small">El theme elegido se guarda solo en este navegador.</p>
      </div>
      <div class="grid two theme-settings-grid">
        <label>Theme activo
          <select data-theme-select>
            ${themeOptions
              .map(
                (theme) =>
                  `<option value="${theme.value}" ${theme.value === selectedTheme ? "selected" : ""}>${escapeHtml(theme.label)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <div class="theme-preview" aria-live="polite">
          <span>${escapeHtml(themeOptions.find((theme) => theme.value === selectedTheme)?.label ?? "Base / Default")}</span>
          <p class="muted small">${escapeHtml(themeOptions.find((theme) => theme.value === selectedTheme)?.description ?? "El estilo actual de MTG Trade.")}</p>
        </div>
      </div>
    </div>
  `;
}

function renderUserDataPanel() {
  const local = localMigrationSummary();
  const cloudTrades = state.trades.filter((trade) =>
    isCloudTrade(trade),
  ).length;
  const cloudBulks = state.bulks.filter(
    (bulk) => bulk.source === "cloud",
  ).length;
  const cloudDecks = state.cloud.decks.length;
  return `
    <div class="panel stack">
      <div>
        <p class="eyebrow">Datos</p>
        <h3>Resumen</h3>
      </div>
      <div class="grid three">
        <div class="stat"><span class="muted">Trades cloud</span><strong>${cloudTrades}</strong></div>
        <div class="stat"><span class="muted">Bulks cloud</span><strong>${cloudBulks}</strong></div>
        <div class="stat"><span class="muted">Decks cloud</span><strong>${cloudDecks}</strong></div>
      </div>
      <div class="grid three">
        <div class="stat"><span class="muted">Trades locales</span><strong>${local.trades}</strong></div>
        <div class="stat"><span class="muted">Bulks locales</span><strong>${local.bulks}</strong></div>
        <div class="stat"><span class="muted">Deck local</span><strong>${local.hasDeck ? "Sí" : "No"}</strong></div>
      </div>
    </div>
  `;
}

function renderCloudPanel() {
  const cloud = state.cloud;
  const status = `${cloud.error ? `<div class="notice cloud-error">${escapeHtml(cloud.error)}</div>` : ""}${cloud.message ? `<div class="notice">${escapeHtml(cloud.message)}</div>` : ""}`;

  if (cloud.loading) {
    return `
      <div class="panel cloud-panel stack">
        <div>
          <p class="eyebrow">Nube</p>
          <h3>Conectando con Supabase…</h3>
        </div>
      </div>
    `;
  }

  if (!cloud.configured) {
    return `
      <div class="panel cloud-panel stack">
        <div>
          <p class="eyebrow">Nube</p>
          <h3>Supabase pendiente de configurar</h3>
          <p class="muted small">Rellena <code>supabase-config.js</code> con el Project URL y la anon public key. La app seguirá funcionando localmente mientras tanto.</p>
        </div>
        ${status}
      </div>
    `;
  }

  if (!cloud.user) {
    return `
      <form class="panel cloud-panel stack" data-auth-form>
        <div>
          <p class="eyebrow">Nube</p>
          <h3>Iniciar sesión</h3>
          <p class="muted small">Puedes entrar con Google directamente, o pedir un enlace mágico por email. Al iniciar sesión aceptas la <a href="#/privacy">política de privacidad</a> y los <a href="#/terms">términos</a>.</p>
        </div>
        ${status}
        <div class="row cloud-auth-row">
          <button class="button" type="button" data-action="sign-in-google">Entrar con Google</button>
        </div>
        <div class="row cloud-auth-row">
          <label>Email
            <input id="authEmail" type="email" autocomplete="email" placeholder="tu@email.com" />
          </label>
          <button class="ghost-button" type="submit">Enviar enlace</button>
        </div>
      </form>
    `;
  }

  if (!cloud.profile) {
    return `
      <form class="panel cloud-panel stack" data-profile-form>
        <div>
          <p class="eyebrow">Perfil</p>
          <h3>Completa tu perfil</h3>
          <p class="muted small">Intentamos crearlo automáticamente al iniciar sesión. Si ves esto, elige un username público para buscar usuarios, publicar bulks e invitar a trades. Tu email seguirá siendo privado.</p>
        </div>
        ${status}
        <div class="grid two">
          <label>Username
            <input id="profileUsername" required minlength="3" maxlength="24" pattern="[a-zA-Z0-9_-]+" placeholder="mousachs" />
          </label>
          <label>Nombre visible opcional
            <input id="profileDisplayName" maxlength="80" placeholder="Ian" />
          </label>
        </div>
        <div class="row">
          <button class="button" type="submit">Guardar perfil</button>
          <button class="ghost-button" type="button" data-action="sign-out">Cerrar sesión</button>
        </div>
      </form>
    `;
  }

  return `
    <div class="panel cloud-panel stack">
      <div class="spread">
        <div>
          <p class="eyebrow">Nube</p>
          <h3>Sesión iniciada</h3>
          <p class="muted small">@${escapeHtml(cloud.profile.username)}${cloud.profile.display_name ? ` · ${escapeHtml(cloud.profile.display_name)}` : ""}</p>
        </div>
        <button class="ghost-button" type="button" data-action="sign-out">Cerrar sesión</button>
      </div>
      ${status}
      <div class="notice">Nube activa: autenticación, perfil, bulks, decks y trades en Supabase.</div>
      ${renderLocalMigrationPanel()}
    </div>
  `;
}

function renderLocalMigrationPanel() {
  const summary = localMigrationSummary();
  const total = summary.trades + summary.bulks + (summary.hasDeck ? 1 : 0);
  if (!total) return "";
  return `
    <div class="notice">
      <strong>Datos locales detectados</strong>
      <p class="small">Hay ${summary.trades} trade${summary.trades === 1 ? "" : "s"}, ${summary.bulks} bulk${summary.bulks === 1 ? "" : "s"}${summary.hasDeck ? " y 1 deck" : ""} en este navegador. Esto subirá datos a Supabase; no se borrarán del navegador y repetir la acción puede duplicarlos.</p>
      <div class="row">
        <button class="ghost-button" type="button" data-action="migrate-local-data-to-cloud">Migrar datos locales a nube</button>
        ${summary.trades ? `<button class="danger-button" type="button" data-action="clear-local-trades">Borrar trades locales</button>` : ""}
      </div>
    </div>
  `;
}
