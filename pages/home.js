function renderHome() {
  const totalBulks = state.bulks.length;
  const totalCards = Object.values(totalInventory()).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  app.innerHTML = `
    <section class="stack">
      <div class="spread">
        <div>
          <p class="eyebrow">Inicio</p>
          <h2>Trades guardados</h2>
        </div>
        <div class="row">
          ${isCloudReady() ? `<button class="ghost-button" type="button" data-action="refresh-cloud-trades" title="Recargar trades de Supabase" aria-label="Recargar trades">Recargar</button>` : ""}
          <button class="button" type="button" data-action="new-trade" title="Crear un nuevo trade" aria-label="Crear un nuevo trade">Nuevo trade</button>
        </div>
      </div>
      <div class="grid three">
        <div class="stat"><span class="muted">Trades</span><strong>${state.trades.length}</strong></div>
        <div class="stat"><span class="muted">Personas / bulks</span><strong>${totalBulks}</strong></div>
        <div class="stat"><span class="muted">Copias disponibles</span><strong>${totalCards}</strong></div>
      </div>
      ${renderCloudPanel()}
      <div class="panel backup-panel">
        <div>
          <p class="eyebrow">Backup</p>
          <h3>Exportar / importar datos</h3>
          <p class="muted small">Guarda trades, bulks/personas y configuración del navegador actual.</p>
        </div>
        <div class="row">
          <button class="ghost-button" type="button" data-action="export-data" title="Descargar backup JSON" aria-label="Exportar datos">Exportar datos</button>
          <button class="ghost-button" type="button" data-action="import-data" title="Cargar backup JSON" aria-label="Importar datos">Importar datos</button>
          <input id="importDataFile" type="file" accept="application/json,.json" hidden />
        </div>
      </div>
      <div class="card-grid">
        ${state.trades.length ? state.trades.map(renderTradeCard).join("") : `<div class="empty-state">No hay trades guardados todavía.</div>`}
      </div>
    </section>
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
          <p class="muted small">Enviaremos un enlace mágico a tu email. Al iniciar sesión aceptas la <a href="#/privacy">política de privacidad</a> y los <a href="#/terms">términos</a>.</p>
        </div>
        ${status}
        <div class="row cloud-auth-row">
          <label>Email
            <input id="authEmail" type="email" autocomplete="email" required placeholder="tu@email.com" />
          </label>
          <button class="button" type="submit">Enviar enlace</button>
        </div>
      </form>
    `;
  }

  if (!cloud.profile) {
    return `
      <form class="panel cloud-panel stack" data-profile-form>
        <div>
          <p class="eyebrow">Perfil</p>
          <h3>Elige tu username público</h3>
          <p class="muted small">Es obligatorio para buscar usuarios, publicar bulks e invitar a trades. Tu email seguirá siendo privado.</p>
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
      <button class="ghost-button" type="button" data-action="migrate-local-data-to-cloud">Migrar datos locales a nube</button>
    </div>
  `;
}

function renderTradeCard(trade) {
  const mine = calculateTradeTotals(trade, "mine").points;
  const theirs = calculateTradeTotals(trade, "theirs").points;
  const cloud = isCloudTrade(trade);
  const locked = isTradeLocked(trade);
  const participants = cloud
    ? renderTradeParticipantsSummary(trade)
    : `${ownerName(trade.mineOwnerId) || "Yo sin asignar"} ↔ ${ownerName(trade.theirOwnerId) || "Otra persona sin asignar"}`;
  return `
    <article class="item-card stack">
      <div class="spread">
        <div>
          <h3>${escapeHtml(trade.name)} ${cloud ? `<span class="rarity-badge rarity-uncommon">Cloud</span>` : ""}</h3>
          <p class="muted small">${participants}</p>
        </div>
        <span class="rarity-badge rarity-rare">${mine} - ${theirs}</span>
      </div>
      <p class="muted small">Actualizado: ${formatDate(trade.updatedAt)}${locked ? " · Bloqueado" : ""}</p>
      <div class="row">
        <button class="button" type="button" data-action="open-trade" data-trade-id="${trade.id}" title="Abrir este trade" aria-label="Abrir ${escapeHtml(trade.name)}">Abrir</button>
        ${cloud ? "" : `<button class="danger-button" type="button" data-action="delete-trade" data-trade-id="${trade.id}" title="Eliminar este trade" aria-label="Eliminar ${escapeHtml(trade.name)}">Eliminar</button>`}
      </div>
    </article>
  `;
}

function renderTradeParticipantsSummary(trade) {
  return (
    (trade.participants ?? [])
      .map((participant) => {
        const username = participant.profile?.username ?? "usuario";
        const status =
          participant.acceptance_status === "accepted"
            ? "aceptado"
            : "pendiente";
        return `@${escapeHtml(username)} (${status})`;
      })
      .join(" ↔ ") || "Solo tú"
  );
}
