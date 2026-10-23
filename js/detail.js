let currentId = null;
let currentItem = null;
let pendingImageFile = null;

const el = id => document.getElementById(id);
const statusBox = el('detail-status');

function showStatus(message, type = 'info') {
  statusBox.textContent = message;
  statusBox.className = `status-msg show ${type}`;
}

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

function renderItem(item) {
  document.title = `${item.descripcion} — Detalle del elemento`;
  const imageHtml = item.imagen
    ? `<img class="detail-photo" src="${item.imagen}" alt="${item.descripcion}"
         onerror="this.outerHTML='<div class=&quot;detail-photo detail-photo-empty&quot;>Sin foto disponible</div>'">`
    : '<div class="detail-photo detail-photo-empty">Sin foto disponible</div>';

  el('detail-content').innerHTML = `
    <div class="detail-card">
      ${imageHtml}
      <div class="detail-body">
        <div class="detail-header">
          <span class="id">${item.id}</span>
          <span class="${tipoBadgeClass(item.tipo_inventario)}">${item.tipo_inventario}</span>
        </div>
        <h1>${item.descripcion}</h1>
        ${row('Ubicación', item.ubicacion)}
        ${row('Funcionario a cargo', item.funcionario)}
        ${row('Observación', item.observacion)}
      </div>
    </div>
  `;
}

function loadConfig() {
  const remembered = localStorage.getItem('inv-config');
  if (remembered) {
    const config = JSON.parse(remembered);
    el('cfg-owner').value = config.owner || 'Dimitri-1999';
    el('cfg-repo').value = config.repo || 'inventario_eic';
    el('cfg-branch').value = config.branch || 'main';
    el('cfg-remember').checked = true;
  } else {
    el('cfg-owner').value = 'Dimitri-1999';
    el('cfg-repo').value = 'inventario_eic';
  }
  const token = sessionStorage.getItem('inv-token');
  if (token) el('cfg-token').value = token;
}

function getConfig() {
  return {
    owner: el('cfg-owner').value.trim(),
    repo: el('cfg-repo').value.trim(),
    branch: el('cfg-branch').value.trim() || 'main',
    token: el('cfg-token').value.trim(),
  };
}

function persistConfig() {
  const config = getConfig();
  sessionStorage.setItem('inv-token', config.token);
  if (el('cfg-remember').checked) {
    localStorage.setItem('inv-config', JSON.stringify({
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
    }));
  } else {
    localStorage.removeItem('inv-config');
  }
}

function populateForm(item) {
  el('f-id').value = item.id;
  el('f-tipo').value = item.tipo_inventario;
  el('f-descripcion').value = item.descripcion;
  el('f-ubicacion').value = item.ubicacion || '';
  if (![...el('f-funcionario').options].some(option => option.value === (item.funcionario || ''))) {
    const option = document.createElement('option');
    option.value = item.funcionario;
    option.textContent = item.funcionario;
    el('f-funcionario').appendChild(option);
  }
  el('f-funcionario').value = item.funcionario || '';
  el('f-observacion').value = item.observacion || '';
  el('f-imagen').value = '';
  el('imagen-actual').textContent = item.imagen ? `Foto actual: ${item.imagen}` : 'Sin foto';
  pendingImageFile = null;
}

el('edit-item-btn').addEventListener('click', () => {
  if (!currentItem) return;
  populateForm(currentItem);
  el('edit-panel').style.display = 'block';
  el('edit-panel').scrollIntoView({ behavior: 'smooth' });
  statusBox.className = 'status-msg';
});

el('f-imagen').addEventListener('change', event => {
  pendingImageFile = event.target.files[0] || null;
});

el('cancel-edit-btn').addEventListener('click', () => {
  el('edit-panel').style.display = 'none';
  pendingImageFile = null;
  statusBox.className = 'status-msg';
});

el('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  const config = getConfig();
  const id = el('f-id').value.trim();
  const funcionario = el('f-funcionario').value.trim();

  if (!config.owner || !config.repo || !config.token) {
    el('github-config').open = true;
    showStatus('Completa la conexión con GitHub para guardar los cambios. Tus cambios en el formulario se conservaron.', 'error');
    return;
  }

  try {
    persistConfig();
    showStatus(pendingImageFile ? 'Subiendo foto…' : 'Guardando cambios…');
    const result = await InventoryApi.read(config);
    const original = result.items.find(item => String(item.id) === String(currentId));
    if (!original) throw new Error(`El elemento ${currentId} ya no existe en el repositorio.`);
    if (result.items.some(item => String(item.id) === id && String(item.id) !== String(currentId))) {
      throw new Error(`Ya existe un elemento con el número ${id}.`);
    }

    const updatedItem = {
      ...original,
      id,
      descripcion: el('f-descripcion').value.trim(),
      ubicacion: el('f-ubicacion').value.trim(),
      observacion: el('f-observacion').value.trim(),
      tipo_inventario: el('f-tipo').value,
      funcionario,
    };
    if (pendingImageFile) {
      updatedItem.imagen = await InventoryApi.uploadImage(config, pendingImageFile, funcionario, id);
    }

    const updatedItems = result.items.map(item =>
      String(item.id) === String(currentId) ? updatedItem : item
    );
    await InventoryApi.save(config, updatedItems, `Editar ítem ${id} en el inventario`, result.sha);
    currentId = id;
    currentItem = updatedItem;
    history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
    renderItem(updatedItem);
    el('edit-panel').style.display = 'none';
    showStatus('Cambios guardados en GitHub.', 'ok');
  } catch (error) {
    showStatus(error.message, 'error');
    if (error.message.includes('(401)')) {
      sessionStorage.removeItem('inv-token');
      el('cfg-token').value = '';
      el('github-config').open = true;
    }
  }
});

el('delete-item-btn').addEventListener('click', async () => {
  const config = getConfig();
  if (!config.owner || !config.repo || !config.token) {
    el('github-config').open = true;
    showStatus('Completa la conexión con GitHub para eliminar este registro.', 'error');
    return;
  }
  if (!confirm(`¿Eliminar el elemento ${currentId}? La foto asociada no se borra automáticamente.`)) return;

  try {
    persistConfig();
    showStatus('Eliminando elemento…');
    const result = await InventoryApi.read(config);
    if (!result.items.some(item => String(item.id) === String(currentId))) {
      throw new Error(`El elemento ${currentId} ya no existe en el repositorio.`);
    }
    const remainingItems = result.items.filter(item => String(item.id) !== String(currentId));
    await InventoryApi.save(config, remainingItems, `Eliminar ítem ${currentId} del inventario`, result.sha);
    showStatus('Elemento eliminado. Volviendo al inventario…', 'ok');
    setTimeout(() => { location.href = 'index.html'; }, 900);
  } catch (error) {
    showStatus(error.message, 'error');
  }
});

(async () => {
  loadConfig();
  const params = new URLSearchParams(location.search);
  currentId = params.get('id');
  const container = el('detail-content');
  if (!currentId) {
    container.innerHTML = '<p class="empty">No se indicó qué elemento mostrar.</p>';
    return;
  }

  try {
    const response = await fetch('data/items.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar data/items.json');
    const items = await response.json();
    currentItem = items.find(item => String(item.id) === String(currentId));
    if (!currentItem) {
      container.innerHTML = `<p class="empty">No se encontró un elemento con el número ${currentId}.</p>`;
      return;
    }
    renderItem(currentItem);
    el('detail-actions').style.display = 'flex';
  } catch (error) {
    container.innerHTML = `<p class="empty">Error cargando el elemento: ${error.message}</p>`;
  }
})();
