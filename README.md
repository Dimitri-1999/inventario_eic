# Inventario EIC

Sitio estático publicado con GitHub Pages para consultar el inventario de
elementos, buscar y filtrar registros, ver sus detalles y fotografías, y
administrar registros desde un formulario conectado a GitHub.

Los datos y las imágenes viven en este repositorio. GitHub Pages sirve el
sitio; el formulario de administración usa la API de GitHub para guardar los
cambios mediante commits. No hay un servidor propio.

## Contenido del repositorio

```text
inventario_eic/
├── index.html                         # Consulta, búsqueda y filtros
├── item.html                          # Detalle de un elemento
├── admin.html                         # Inicio de sesión y administración
├── generar-hash.html                  # Generador de hash SHA-256
├── css/style.css
├── js/app.js                          # Lógica de la consulta
├── js/detail.js                       # Lógica del detalle
├── js/admin.js                        # Administración mediante API de GitHub
├── data/items.json                    # Inventario publicado
├── data/credentials.json              # Usuarios y hashes del formulario
├── data/INVENTARIO 2026 MILLER.xlsx   # Excel fuente
├── scripts/excel_json.py              # Sincronización Excel → JSON
├── scripts/requeriments.txt           # Dependencias de Python
├── .github/workflows/sync inventario.yml
└── fotos_inventario/                  # Fotografías de los elementos
```

## Publicar el sitio

En GitHub, abre **Settings → Pages** y configura **Deploy from a branch**,
rama `main`, carpeta `/ (root)`. GitHub Pages publicará el sitio en una URL
como `https://<usuario>.github.io/<repositorio>/`.

## Consultar el inventario

La página principal permite buscar por número, descripción, ubicación u
observación, y filtrar por tipo de inventario y funcionario. Selecciona una
fila para abrir su ficha con los datos y la fotografía, si tiene una.

Los registros se leen de `data/items.json`. Cada elemento tiene esta forma:

```json
{
  "id": "1001",
  "descripcion": "Escritorio en L con superficie de madera",
  "ubicacion": "Oficina rectoría",
  "observacion": "Buen estado",
  "tipo_inventario": "Mayor",
  "funcionario": "MILLER HUMBERTO SALAS R",
  "imagen": "fotos_inventario/miller/1001.jpg"
}
```

`tipo_inventario` suele ser `Mayor`, `Menor` o `Intangible`. `imagen` es una
ruta relativa a un archivo del repositorio; puede quedar vacía si el elemento
no tiene foto.

## Administración desde `admin.html`

1. Inicia sesión con un usuario configurado en `data/credentials.json`.
2. En **Configuración de conexión con GitHub**, ingresa el propietario, el
   nombre del repositorio, la rama (normalmente `main`) y un token fine-grained.
3. Limita el token a este repositorio y concede únicamente **Contents: Read
   and write**.
4. Añade, edita o elimina elementos. Si adjuntas una fotografía, se guarda
   bajo `fotos_inventario/<funcionario>/<id>.<extensión>`.
5. El formulario guarda los cambios en GitHub y actualiza `data/items.json`.

El propietario, el repositorio y la rama pueden recordarse en el navegador.
El token se conserva en `sessionStorage` durante la sesión y no se escribe en
el repositorio. No uses un token con acceso más amplio del necesario.

### Aviso de seguridad

GitHub Pages es público y no proporciona un backend de autenticación. El
contenido de `data/credentials.json`, incluidos los hashes SHA-256, puede ser
consultado por cualquier visitante. Ese hash no debe considerarse una
protección fuerte: puede someterse a intentos de adivinación fuera de línea.
El formulario de login sirve para identificar al usuario de la interfaz; el
token con permiso de escritura es lo que autoriza las modificaciones en
GitHub. Quien tenga ese token puede escribir en el repositorio dentro de los
permisos concedidos. Si necesitas controles de acceso por persona o proteger
credenciales de verdad, usa un backend con autenticación; no publiques el
token en los archivos del sitio.

Para cambiar un hash, abre `generar-hash.html`, genera el SHA-256 de la nueva
contraseña y reemplaza el valor correspondiente en `data/credentials.json`.
Los usuarios de ejemplo y sus credenciales deben revisarse y cambiarse antes
de distribuir el sitio.

## Sincronizar el inventario desde Excel

El script `scripts/excel_json.py` convierte el Excel fuente en
`data/items.json`. Requiere Python y las dependencias declaradas en
`scripts/requeriments.txt` (`pandas` y `openpyxl`).

En Windows, desde la carpeta del repositorio:

```powershell
python -m pip install -r scripts\requeriments.txt
python scripts\excel_json.py
```

Sin argumentos, el script busca en `data/` un archivo cuyo nombre coincida con
`*INVENTARIO*MILLER*.xls*`. Para indicar otra ruta:

```powershell
python scripts\excel_json.py --excel "data\INVENTARIO 2026 MILLER.xlsx"
```

El Excel debe incluir las columnas de número de inventario, descripción del
elemento, ubicación, observación, tipo de inventario y funcionario. El script
normaliza los encabezados, ignora filas sin número y escribe los registros
válidos en `data/items.json`.

### Reglas para conservar datos y fotos

- Para elementos existentes, los campos del Excel actualizan los datos; si
  una celda está vacía, se conserva el valor anterior de ese campo.
- La foto existente de un elemento se conserva. Si `imagen` está vacía, el
  script busca una foto con el mismo número de inventario y extensión `.jpg`,
  `.jpeg`, `.png` o `.webp` dentro de `fotos_inventario/`.
- Las fotos cuyo nombre no coincide con ningún número de inventario se
  reportan como huérfanas. El script también informa cuántos elementos siguen
  sin foto.
- Los elementos que ya estaban en `items.json` y no aparecen en el Excel se
  conservan por defecto. Usa `--prune` solo si quieres eliminarlos.
- Usa `--no-link-images` para desactivar el enlace automático de fotos.

Ejemplo para eliminar registros que ya no estén en el Excel y no enlazar fotos:

```powershell
python scripts\excel_json.py --prune --no-link-images
```

Revisa `data/items.json` y los mensajes del script antes de publicar cambios.

## Automatización con GitHub Actions

El workflow `.github/workflows/sync inventario.yml` se ejecuta cuando se
publica un cambio en `data/*.xlsx`, `data/*.xls` o `fotos_inventario/**` en la
rama `main`. También se puede iniciar manualmente desde
**GitHub → Actions → Sincronizar inventario desde Excel → Run workflow**.

El workflow instala Python y las dependencias, ejecuta
`python scripts/excel_json.py` y crea un commit en `data/items.json` solo si
hubo cambios. Tiene permiso `contents: write` para hacer ese commit.

Para actualizar el Excel localmente, súbelo primero al repositorio:

```powershell
git add "data/INVENTARIO 2026 MILLER.xlsx"
git commit -m "Actualizar inventario"
git push
```

Subir fotos a `fotos_inventario/` también dispara el workflow, que puede
enlazarlas automáticamente en los elementos que coincidan por número. Los
cambios hechos desde `admin.html` se guardan directamente mediante la API de
GitHub y no dependen de ejecutar este workflow. GitHub Pages publica la
versión actualizada después de que se suban los cambios.
