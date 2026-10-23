(() => {
  const dataPath = 'data/items.json';

  function contentsUrl(config, path) {
    return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
  }

  function authHeaders(config) {
    return {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
    };
  }

  function requireConfig(config) {
    if (!config.owner || !config.repo || !config.token) {
      throw new Error('Configura propietario, repositorio y token de GitHub antes de guardar cambios.');
    }
  }

  async function read(config) {
    requireConfig(config);
    const response = await fetch(`${contentsUrl(config, dataPath)}?ref=${config.branch}`, {
      headers: authHeaders(config),
    });
    if (!response.ok) {
      throw new Error(`No se pudo leer el archivo desde GitHub (${response.status}). Revisa usuario/repo/token.`);
    }
    const file = await response.json();
    const bytes = Uint8Array.from(atob(file.content), character => character.charCodeAt(0));
    return { items: JSON.parse(new TextDecoder().decode(bytes)), sha: file.sha };
  }

  async function save(config, items, message, sha) {
    requireConfig(config);
    if (!sha) throw new Error('No se pudo obtener la versión actual del inventario desde GitHub.');

    const content = btoa(unescape(encodeURIComponent(`${JSON.stringify(items, null, 2)}\n`)));
    const response = await fetch(contentsUrl(config, dataPath), {
      method: 'PUT',
      headers: authHeaders(config),
      body: JSON.stringify({ message, content, branch: config.branch, sha }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Error al guardar el inventario (${response.status})`);
    }
    return (await response.json()).content.sha;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(config, file, funcionario, itemId) {
    requireConfig(config);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `fotos_inventario/${funcionario}/${itemId}.${ext}`;
    const base64 = await fileToBase64(file);
    const headers = authHeaders(config);

    const check = await fetch(`${contentsUrl(config, path)}?ref=${config.branch}`, { headers });
    let sha = null;
    if (check.ok) {
      sha = (await check.json()).sha;
    } else if (check.status !== 404) {
      throw new Error(`No se pudo comprobar la foto existente (${check.status}).`);
    }

    const body = { message: `Subir foto de ítem ${itemId}`, content: base64, branch: config.branch };
    if (sha) body.sha = sha;
    const response = await fetch(contentsUrl(config, path), {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Error al subir la foto (${response.status})`);
    }
    return path;
  }

  window.InventoryApi = { read, save, uploadImage };
})();
