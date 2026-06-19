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
