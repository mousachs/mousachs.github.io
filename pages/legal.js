function renderPrivacyPage() {
  app.innerHTML = `
    <section class="stack legal-doc">
      <div>
        <p class="eyebrow">Legal</p>
        <h2>Política de privacidad</h2>
        <p class="muted small">Última actualización: ${new Date().toISOString().slice(0, 10)}</p>
      </div>
      <div class="panel stack">
        <h3>Responsable</h3>
        <p>MTG Trade es un proyecto personal/fan gestionado por el titular de esta web. Para ejercer derechos o solicitar borrado de datos, contacta con el titular del repositorio/web.</p>
        <h3>Datos que tratamos</h3>
        <ul>
          <li>Email de login, gestionado por Supabase Auth.</li>
          <li>Username y nombre visible opcional.</li>
          <li>Bulks, decks, trades, participantes, estados de aceptación y fechas de creación/actualización.</li>
          <li>Datos guardados localmente en tu navegador cuando usas la app sin sesión.</li>
        </ul>
        <h3>Finalidad</h3>
        <p>Usamos estos datos para autenticar usuarios, sincronizar datos entre dispositivos, mostrar bulks públicos a usuarios logueados y permitir trades privados entre participantes.</p>
        <h3>Visibilidad</h3>
        <ul>
          <li>Tu email no es público.</li>
          <li>Tu username es público para otros usuarios logueados.</li>
          <li>Los bulks públicos son visibles para usuarios logueados; los privados solo para ti.</li>
          <li>Los decks son privados por defecto.</li>
          <li>Los trades solo son visibles para sus participantes.</li>
        </ul>
        <h3>Base legal</h3>
        <p>El tratamiento se basa en prestar el servicio solicitado por el usuario y en tu decisión al publicar, compartir o migrar datos.</p>
        <h3>Proveedores</h3>
        <p>La app usa GitHub Pages para servir la web y Supabase para autenticación y base de datos. También usa datos e imágenes de cartas de Scryfall.</p>
        <h3>Conservación y derechos</h3>
        <p>Los datos se conservan mientras uses la app o hasta que solicites su borrado. Puedes exportar tus datos mediante backups locales. Puedes solicitar acceso, rectificación o borrado de tus datos cloud contactando con el titular de la web.</p>
        <h3>Cookies y almacenamiento local</h3>
        <p>La app usa almacenamiento local y tokens de sesión necesarios para funcionar. No usamos analítica ni cookies publicitarias.</p>
      </div>
    </section>
  `;
}

function renderTermsPage() {
  app.innerHTML = `
    <section class="stack legal-doc">
      <div>
        <p class="eyebrow">Legal</p>
        <h2>Términos de uso</h2>
      </div>
      <div class="panel stack">
        <h3>Uso de la app</h3>
        <p>MTG Trade permite gestionar cartas, bulks, decks y trades de Magic: The Gathering. Usa la app bajo tu responsabilidad y revisa los datos antes de cerrar cualquier intercambio.</p>
        <h3>Contenido de usuario</h3>
        <p>No publiques contenido ilegal, ofensivo o que vulnere derechos de terceros. Al marcar un bulk como público aceptas que otros usuarios logueados puedan verlo.</p>
        <h3>Trades</h3>
        <p>Al vincular a otro usuario a un trade, ese usuario podrá ver y editar el trade mientras esté desbloqueado. Si alguien acepta, el trade queda bloqueado hasta solicitar cambios.</p>
        <h3>Proyecto fan</h3>
        <p>Proyecto fan no oficial, sin afiliación ni aprobación de Wizards of the Coast, Scryfall o terceros titulares de Magic: The Gathering.</p>
        <h3>Disponibilidad</h3>
        <p>La app se ofrece sin garantías. Puede cambiar, fallar o dejar de estar disponible. Mantén backups de tus datos importantes.</p>
      </div>
    </section>
  `;
}
