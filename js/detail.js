let currentId = null;
let currentItem = null;
let pendingImageFile = null;
let pendingAuthorizedAction = null;

const el = id => document.getElementById(id);
const statusBox = el('detail-status');
const githubDialog = el('github-dialog');

function showStatus(message, type = 'info') {
  statusBox.textContent = message;
  statusBox.className = `status-msg show ${type}`;
}

function tipoBadgeClass(tipo) {
  return 'badge ' + (tipo || '').toLowerCase();
}

function row(label, value) {
  return `
    <div class="detail-row">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value || 'Sin registrar'}</div>
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

function getConfig() {
  return {
    owner: 'Dimitri-1999',
    repo: 'inventario_eic',
    branch: 'main',
    token: sessionStorage.getItem('inv-token') || '',
  };
}

function authorizeAction(action) {
  pendingAuthorizedAction = action;
  el('cfg-token').value = '';
  githubDialog.showModal();
  el('cfg-token').focus();
}

function hasAuthorization(action) {
  if (getConfig().token) return true;
  authorizeAction(action);
  return false;
}

el('github-form').addEventListener('submit', async event => {
  event.preventDefault();
  const token = el('cfg-token').value.trim();
  const action = pendingAuthorizedAction;
  if (!token || !action) return;

  sessionStorage.setItem('inv-token', token);
  pendingAuthorizedAction = null;
  githubDialog.close();
  await action();
});

el('cancel-github').addEventListener('click', () => {
  pendingAuthorizedAction = null;
  githubDialog.close();
});

function handleAuthorizationError(error, retryAction) {
  showStatus(error.message, 'error');
  if (error.message.includes('(401)')) {
    sessionStorage.removeItem('inv-token');
    authorizeAction(retryAction);
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
  if (!hasAuthorization(saveEditedItem)) return;
  await saveEditedItem();
});

async function saveEditedItem() {
  const config = getConfig();
  const id = el('f-id').value.trim();
  const funcionario = el('f-funcionario').value.trim();

  try {
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
    handleAuthorizationError(error, saveEditedItem);
  }
}

el('delete-item-btn').addEventListener('click', async () => {
  if (!confirm(`¿Eliminar el elemento ${currentId}? La foto asociada no se borra automáticamente.`)) return;
  if (!hasAuthorization(deleteCurrentItem)) return;
  await deleteCurrentItem();
});

async function deleteCurrentItem() {
  try {
    showStatus('Eliminando elemento…');
    const config = getConfig();
    const result = await InventoryApi.read(config);
    if (!result.items.some(item => String(item.id) === String(currentId))) {
      throw new Error(`El elemento ${currentId} ya no existe en el repositorio.`);
    }
    const remainingItems = result.items.filter(item => String(item.id) !== String(currentId));
    await InventoryApi.save(config, remainingItems, `Eliminar ítem ${currentId} del inventario`, result.sha);
    showStatus('Elemento eliminado. Volviendo al inventario…', 'ok');
    setTimeout(() => { location.href = 'index.html'; }, 900);
  } catch (error) {
    handleAuthorizationError(error, deleteCurrentItem);
  }
}

(async () => {
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
