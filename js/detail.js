function tipoBadgeClass(tipo) {
  return 'badge ' + (tipo || '').toLowerCase();
}

function row(label, value) {
  if (!value) return '';
  return `
    <div class="detail-row">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value}</div>
    </div>`;
}

function renderItem(it) {
  document.title = `${it.descripcion} — Detalle del elemento`;

  const imageHtml = it.imagen
    ? `<img class="detail-photo" src="${it.imagen}" alt="${it.descripcion}"
         onerror="this.outerHTML='<div class=&quot;detail-photo detail-photo-empty&quot;>Sin foto disponible</div>'">`
    : `<div class="detail-photo detail-photo-empty">Sin foto disponible</div>`;

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-card">
      ${imageHtml}
      <div class="detail-body">
        <div class="detail-header">
          <span class="id">${it.id}</span>
          <span class="${tipoBadgeClass(it.tipo_inventario)}">${it.tipo_inventario}</span>
        </div>
        <h1>${it.descripcion}</h1>
        ${row('Ubicación', it.ubicacion)}
        ${row('Funcionario a cargo', it.funcionario)}
        ${row('Observación', it.observacion)}
      </div>
    </div>
  `;
}

(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const container = document.getElementById('detail-content');

  if (!id) {
    container.innerHTML = `<p class="empty">No se indicó qué elemento mostrar.</p>`;
    return;
  }

  try {
    const res = await fetch('data/items.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar data/items.json');
    const items = await res.json();
    const it = items.find(x => String(x.id) === String(id));
    if (!it) {
      container.innerHTML = `<p class="empty">No se encontró un elemento con el número ${id}.</p>`;
      return;
    }
    renderItem(it);
  } catch (err) {
    container.innerHTML = `<p class="empty">Error cargando el elemento: ${err.message}</p>`;
  }
})();