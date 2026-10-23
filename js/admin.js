let currentSha = null;
let pendingImageFile = null;
let isSaving = false;

const el = id => document.getElementById(id);
const statusBox = el('status');
const githubDialog = el('github-dialog');

function showStatus(msg, type = 'info') {
  statusBox.textContent = msg;
  statusBox.className = `status-msg show ${type}`;
}

function loadConfig() {
  const remembered = localStorage.getItem('inv-config');
  if (remembered) {
    const config = JSON.parse(remembered);
    el('cfg-owner').value = config.owner || el('cfg-owner').value;
    el('cfg-repo').value = config.repo || el('cfg-repo').value;
    el('cfg-branch').value = config.branch || el('cfg-branch').value || 'main';
    el('cfg-remember').checked = true;
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

el('f-imagen').addEventListener('change', event => {
  pendingImageFile = event.target.files[0] || null;
});

async function createItem() {
  if (isSaving) return;
  isSaving = true;
  const saveButton = document.querySelector('#item-form button[type="submit"]');
  saveButton.disabled = true;
  const id = el('f-id').value.trim();
  const funcionario = el('f-funcionario').value.trim();
  const newItem = {
    id,
    descripcion: el('f-descripcion').value.trim(),
    ubicacion: el('f-ubicacion').value.trim(),
    observacion: el('f-observacion').value.trim(),
    tipo_inventario: el('f-tipo').value,
    funcionario,
    imagen: '',
  };

  try {
    showStatus(pendingImageFile ? 'Subiendo foto…' : 'Guardando…');
    persistConfig();
    const config = getConfig();
    const latest = await InventoryApi.read(config);
    const items = latest.items;
    currentSha = latest.sha;
    if (items.some(item => String(item.id) === id)) {
      throw new Error(`Ya existe un ítem con el número ${id}.`);
    }

    if (pendingImageFile) {
      newItem.imagen = await InventoryApi.uploadImage(config, pendingImageFile, funcionario, id);
    }

    showStatus('Guardando inventario…');
    currentSha = await InventoryApi.save(config, [...items, newItem], `Añadir ítem ${id} al inventario`, currentSha);
    el('item-form').reset();
    pendingImageFile = null;
    el('imagen-actual').textContent = '';
    showStatus('Elemento creado y guardado en GitHub.', 'ok');
  } catch (error) {
    showStatus(error.message, 'error');
    if (error.message.includes('(401)')) {
      sessionStorage.removeItem('inv-token');
      el('cfg-token').value = '';
      githubDialog.showModal();
    }
  } finally {
    isSaving = false;
    saveButton.disabled = false;
  }
}

el('item-form').addEventListener('submit', event => {
  event.preventDefault();
  const config = getConfig();
  if (!config.owner || !config.repo || !config.token) {
    githubDialog.showModal();
    return;
  }
  createItem();
});

el('github-form').addEventListener('submit', event => {
  event.preventDefault();
  persistConfig();
  githubDialog.close();
  createItem();
});

el('cancel-github').addEventListener('click', () => githubDialog.close());
loadConfig();
