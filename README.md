# Inventario de elementos (GitHub Pages)

Sitio estático para consultar y editar un inventario de elementos, con los
datos guardados como JSON versionado en el propio repositorio, incluyendo
fotos y acceso con usuario/contraseña al formulario de edición.

## Estructura

```
inventario-git/
├── index.html              # Vista pública: tabla con búsqueda y filtros
├── item.html                # Detalle de un elemento (foto + información)
├── admin.html                 # Login + formulario para añadir/editar/eliminar ítems
├── generar-hash.html           # Utilidad para crear/cambiar contraseñas
├── css/style.css
├── js/app.js                    # Lógica de index.html
├── js/detail.js                  # Lógica de item.html
├── js/admin.js                    # Lógica de admin.html (login, lectura/escritura vía API de GitHub)
├── data/items.json                 # Los datos del inventario
├── data/credentials.json            # Usuarios y contraseñas (hash) para entrar a admin.html
├── data/INVENTARIO 2026 MILLER.xlsx  # Excel fuente (se sincroniza a items.json)
├── scripts/excel_to_json.py           # Script de sincronización Excel → items.json
├── scripts/requirements.txt            # Dependencias del script (pandas, openpyxl)
├── .github/workflows/sync-inventario.yml  # Automatiza la sincronización en cada push
└── fotos_inventario/
    ├── rector/
    ├── jhon/
    ├── yerly/
    └── miller/
```

## 1. Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube el contenido de esta carpeta.
2. Ve a **Settings → Pages**.
3. En "Build and deployment", elige **Deploy from a branch**, rama `main`,
   carpeta `/ (root)`.
4. En un par de minutos tu sitio estará en
   `https://<tu-usuario>.github.io/<tu-repo>/`.

## 2. Campos de cada ítem (`data/items.json`)

```json
{
  "id": "1001",
  "descripcion": "Escritorio en L con superficie de madera",
  "ubicacion": "Oficina rectoría",
  "observacion": "Buen estado",
  "tipo_inventario": "Mayor",
  "funcionario": "rector",
  "imagen": "fotos_inventario/rector/1001.jpg"
}
```

`tipo_inventario` es uno de: `Mayor`, `Menor`, `Intangible`.
`funcionario` corresponde a una de las subcarpetas de `fotos_inventario/`.

## 3. Usuarios y contraseñas de `admin.html`

`data/credentials.json` contiene los usuarios que pueden entrar al formulario
de edición. **Las contraseñas no se guardan en texto plano**, se guarda un
hash (SHA-256):

```json
{ "usuario": "jhon", "hash": "…", "nombre": "Jhon" }
```

Los tres usuarios de ejemplo (`rector`, `jhon`, `yerly`) tienen todos la
contraseña de ejemplo `cambiar123` — **cámbiala antes de usar el sitio**:

1. Abre `generar-hash.html` en el navegador.
2. Escribe la nueva contraseña; te muestra el hash correspondiente.
3. Reemplaza ese hash en el usuario correspondiente dentro de
   `data/credentials.json` y súbelo al repo.

### ⚠️ Qué protege este login y qué no

Este login es una **puerta de identificación**, no un mecanismo de seguridad
fuerte: `data/credentials.json` es un archivo público del repositorio, así
que alguien con conocimientos técnicos podría leerlo e intentar adivinar la
contraseña fuera de línea a partir del hash. Lo que realmente controla quién
puede guardar cambios en el repositorio es el **token de GitHub** que se
configura por separado en "Configuración de conexión con GitHub" dentro de
`admin.html` — solo alguien con ese token puede hacer commits, sin importar
si pasó el login. Trata el login como una forma de saber "quién edita cada
ítem", y el token como el candado real. Si necesitas seguridad más estricta
(por ejemplo, que cada funcionario no pueda editar los ítems de otro), lo
correcto es moverse a una solución con backend real.

## 4. Editar desde el formulario (`admin.html`)

1. Inicia sesión con tu usuario y contraseña.
2. Despliega "Configuración de conexión con GitHub" (solo la primera vez, o
   si no marcaste "recordar"):
   - **Settings de tu cuenta de GitHub → Developer settings → Personal
     access tokens → Fine-grained tokens → Generate new token**.
   - Limita el token **solo a este repositorio**, con permiso
     **Contents: Read and write** únicamente.
   - Pégalo en el campo "Token de GitHub".
3. Completa el formulario (número de inventario, descripción, ubicación,
   observación, tipo, funcionario y, opcionalmente, una foto) y guarda.
4. Cada guardado crea uno o dos commits: la foto (si la subiste, a
   `fotos_inventario/<funcionario>/<numero>.<extensión>`) y el registro en
   `data/items.json`.

El token se guarda solo en el navegador (`sessionStorage`, nunca se sube al
repo). No compartas `admin.html` con un enlace público visible si no quieres
que cualquiera con el token de alguien más pueda editar; para uso interno
basta con no anunciar la URL fuera del equipo.

## 5. Importar desde Excel

`data/items.json` ya trae los 413 ítems de `INVENTARIO_2026_MILLER.xlsx`
convertidos a este formato. El campo `funcionario` guarda el nombre completo
tal cual venía en el Excel (ej. "MILLER HUMBERTO SALAS R"); el formulario de
`admin.html` sugiere automáticamente los nombres ya usados, pero acepta
cualquier nombre nuevo en texto libre.

Cuando subas una foto desde el formulario, la carpeta se calcula sola a
partir de la **primera palabra del nombre del funcionario en minúsculas**
(ej. "MILLER Humberto…" → `fotos_inventario/miller/`). Por eso ya existe la
carpeta `fotos_inventario/miller/`; si aparecen otros funcionarios nuevos
se creará su carpeta automáticamente al subir su primera foto.

Todos los ítems del Excel tenían el campo `UBICACIÓN` y `OBSERVACION`
vacíos, y la columna `IMAGEN` solo traía la ruta de la carpeta sin nombre de
archivo (`fotos_inventario/miller`), así que `imagen` quedó vacío en todos
— edítalos desde `admin.html` a medida que tengas esa información y las
fotos.

Si más adelante tienes otro Excel (por ejemplo de otro funcionario), lo
puedes traer y te ayudo a fusionarlo con `data/items.json` sin perder lo que
ya hay.

## 6. Sincronización automática Excel → `items.json`

`excel_json.py` lee el Excel y actualiza `data/items.json`,
**sin borrar nunca las fotos** que ya hayas cargado desde `admin.html` (el
campo `imagen` de cada ítem nunca se toca desde este script). Si un ítem ya
no aparece en el Excel, por defecto se conserva en `items.json` (se avisa
por consola); solo se elimina si corres el script con `--prune`.

### Uso local (en tu equipo, Windows)

```powershell
cd C:\Users\carlos.garcia\Desktop\github\inventario_eic
pip install pandas openpyxl
python excel_json.py
```

Si no pasas `--excel`, el script busca automáticamente el archivo `INVENTARIO
2026 MILLER` dentro de `data/`. También puedes indicar la ruta manualmente con
`python excel_json.py --excel "data\INVENTARIO 2026 MILLER.xlsx"`.

### Automatización con GitHub Actions (`.github/workflows/sync-inventario.yml`)

Importante: **GitHub no puede "ver" cambios en tu archivo local** mientras
lo editas en el Escritorio — solo reacciona cuando ese cambio llega al
repositorio. El flujo real es:

1. Editas el Excel localmente (en `data/INVENTARIO 2026 MILLER.xlsx` dentro
   de tu copia del repo).
2. Lo subes al repositorio como cualquier cambio de Git:
   ```powershell
   git add "data/INVENTARIO 2026 MILLER.xlsx"
   git commit -m "Actualizar inventario de Miller"
   git push
   ```
3. Ese `push` dispara automáticamente el workflow
   `Sincronizar inventario desde Excel`: instala Python, corre
   `scripts/excel_to_json.py`, y si `data/items.json` cambió, hace un commit
   automático con esos cambios de vuelta al repositorio.
4. GitHub Pages se reconstruye solo (uno o dos minutos) y el sitio queda
   actualizado.

Puedes ver el progreso y los logs en la pestaña **Actions** del
repositorio en GitHub. También puedes dispararlo manualmente ahí mismo con
el botón "Run workflow" (sin necesidad de subir un Excel nuevo), gracias a
`workflow_dispatch`.

No se necesita configurar ningún token nuevo para este workflow: usa el
`GITHUB_TOKEN` que GitHub genera automáticamente para cada ejecución, con
permiso de escritura solo sobre este repositorio (ver `permissions:
contents: write` en el archivo del workflow).