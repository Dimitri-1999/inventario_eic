#!/usr/bin/env python3
"""
Sincroniza data/items.json a partir del Excel de inventario.

Uso local (Windows, PowerShell o CMD):
    python excel_json.py
    python excel_json.py --excel "data\\INVENTARIO 2026 MILLER.xlsx"

Uso en GitHub Actions:
    python excel_json.py --excel "data/INVENTARIO 2026 MILLER.xlsx"

Reglas de fusión con el items.json existente (para no perder trabajo hecho
desde admin.html):
  - descripcion, ubicacion, observacion, tipo_inventario, funcionario:
    el Excel manda. Si una celda viene vacía y el ítem ya existía con un
    valor para ese campo, se conserva el valor anterior.
  - imagen: NUNCA se toca aquí. Siempre se conserva lo que ya había en
    items.json (las fotos solo se gestionan desde admin.html).
  - Ítems que están en items.json pero ya no aparecen en el Excel: por
    defecto se conservan (no se borran), y se listan en la consola como
    advertencia. Usa --prune para eliminarlos de verdad.
"""

import argparse
import json
import sys
import unicodedata
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_ITEMS_JSON = REPO_ROOT / "data" / "items.json"
DEFAULT_DATA_DIR = REPO_ROOT / "data"

# Nombre de columna normalizado -> nombre de campo en items.json
COLUMN_MAP = {
    "NUMERO DE INVENTARIO": "id",
    "DESCRIPCION DEL ELEMENTO": "descripcion",
    "UBICACION": "ubicacion",
    "OBSERVACION": "observacion",
    "TIPO INVENTARIO": "tipo_inventario",
    "FUNCIONARIO": "funcionario",
}


def normalize_header(name: str) -> str:
    """Quita tildes, espacios extra y pasa a mayúsculas para comparar encabezados."""
    name = str(name).strip()
    nfkd = unicodedata.normalize("NFD", name)
    ascii_name = nfkd.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_name.upper().split())


def find_excel(explicit_path: str | None) -> Path:
    if explicit_path:
        path = Path(explicit_path)
        if not path.exists():
            sys.exit(f"No se encontró el archivo de Excel: {path}")
        return path

    candidates = sorted(DEFAULT_DATA_DIR.glob("*INVENTARIO*2026 *ILLER*.xls*"))
    if not candidates:
        sys.exit(
            f"No se encontró ningún Excel tipo 'INVENTARIO 2026 MILLER' en {DEFAULT_DATA_DIR}. "
            "Indica la ruta con --excel."
        )
    if len(candidates) > 1:
        print("Aviso: hay varios archivos que coinciden, se usará el primero:")
        for c in candidates:
            print(f"  - {c}")
    return candidates[0]


def clean_cell(value) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def load_excel_rows(excel_path: Path) -> list[dict]:
    df = pd.read_excel(excel_path)
    header_lookup = {normalize_header(c): c for c in df.columns}

    missing = [k for k in COLUMN_MAP if k not in header_lookup]
    if missing:
        sys.exit(
            "El Excel no tiene las columnas esperadas: "
            + ", ".join(missing)
            + f"\nColumnas encontradas: {list(df.columns)}"
        )

    rows = []
    for _, row in df.iterrows():
        record = {}
        for excel_col, field in COLUMN_MAP.items():
            raw = row[header_lookup[excel_col]]
            record[field] = clean_cell(raw)
        if not record["id"]:
            continue  # fila vacía o de relleno
        # el número de inventario puede venir como float (106884.0) -> normaliza a texto entero
        try:
            record["id"] = str(int(float(record["id"])))
        except ValueError:
            pass  # deja el id tal cual si no es numérico
        record["tipo_inventario"] = record["tipo_inventario"].title()
        rows.append(record)
    return rows


def merge_items(excel_rows: list[dict], existing_items: list[dict], prune: bool) -> tuple[list[dict], dict]:
    existing_by_id = {it["id"]: it for it in existing_items}
    excel_ids = {r["id"] for r in excel_rows}

    merged = []
    stats = {"nuevos": 0, "actualizados": 0, "sin_cambios": 0, "conservados_sin_excel": 0, "eliminados": 0}

    for row in excel_rows:
        prev = existing_by_id.get(row["id"])
        item = {
            "id": row["id"],
            "descripcion": row["descripcion"] or (prev["descripcion"] if prev else ""),
            "ubicacion": row["ubicacion"] or (prev["ubicacion"] if prev else ""),
            "observacion": row["observacion"] or (prev["observacion"] if prev else ""),
            "tipo_inventario": row["tipo_inventario"] or (prev["tipo_inventario"] if prev else ""),
            "funcionario": row["funcionario"] or (prev["funcionario"] if prev else ""),
            "imagen": prev["imagen"] if prev else "",
        }
        if prev is None:
            stats["nuevos"] += 1
        elif prev != item:
            stats["actualizados"] += 1
        else:
            stats["sin_cambios"] += 1
        merged.append(item)

    leftover = [it for it in existing_items if it["id"] not in excel_ids]
    if leftover and not prune:
        stats["conservados_sin_excel"] = len(leftover)
        merged.extend(leftover)
    elif leftover and prune:
        stats["eliminados"] = len(leftover)

    return merged, stats, leftover


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--excel", help="Ruta al archivo .xlsx (si no se indica, se busca en data/)")
    parser.add_argument("--items", default=str(DEFAULT_ITEMS_JSON), help="Ruta al items.json de salida")
    parser.add_argument("--prune", action="store_true", help="Elimina de items.json los ítems que ya no están en el Excel")
    args = parser.parse_args()

    excel_path = find_excel(args.excel)
    items_path = Path(args.items)

    print(f"Leyendo Excel: {excel_path}")
    excel_rows = load_excel_rows(excel_path)
    print(f"Filas válidas encontradas: {len(excel_rows)}")

    existing_items = []
    if items_path.exists():
        existing_items = json.loads(items_path.read_text(encoding="utf-8"))

    merged, stats, leftover = merge_items(excel_rows, existing_items, args.prune)

    if leftover and not args.prune:
        print(f"Aviso: {len(leftover)} ítem(s) en items.json ya no están en el Excel (se conservan):")
        for it in leftover:
            print(f"  - {it['id']}: {it['descripcion']}")
        print("Usa --prune si quieres eliminarlos automáticamente.")

    new_content = json.dumps(merged, ensure_ascii=False, indent=2) + "\n"
    old_content = items_path.read_text(encoding="utf-8") if items_path.exists() else None

    print(
        f"Nuevos: {stats['nuevos']}  Actualizados: {stats['actualizados']}  "
        f"Sin cambios: {stats['sin_cambios']}  Conservados sin Excel: {stats['conservados_sin_excel']}  "
        f"Eliminados: {stats['eliminados']}"
    )

    if new_content == old_content:
        print("Sin cambios respecto al items.json actual — no se escribe nada.")
        return

    items_path.parent.mkdir(parents=True, exist_ok=True)
    items_path.write_text(new_content, encoding="utf-8")
    print(f"Actualizado: {items_path}")


if __name__ == "__main__":
    main()