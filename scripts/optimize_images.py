#!/usr/bin/env python3
"""Reduce inventory photo dimensions and file size without changing their paths."""

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parent.parent
PHOTOS_DIR = REPO_ROOT / "fotos_inventario"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_DIMENSION = 2000
JPEG_QUALITY = 82
MIN_SIZE_REDUCTION = 0.10


def changed_images(base: str, head: str) -> list[Path]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "-z", base, head, "--", "fotos_inventario/"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
    )
    paths = []
    for raw_path in result.stdout.split(b"\0"):
        if not raw_path:
            continue
        path = REPO_ROOT / Path(raw_path.decode("utf-8"))
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
            paths.append(path)
    return paths


def all_images() -> list[Path]:
    if not PHOTOS_DIR.exists():
        return []
    return sorted(
        path for path in PHOTOS_DIR.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS
    )


def optimize_image(path: Path) -> bool:
    original_size = path.stat().st_size
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source)
        original_dimensions = image.size
        image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
        resized = image.size != original_dimensions
        suffix = path.suffix.lower()
        temporary_path = path.with_name(f".{path.stem}.optimized{suffix}")

        if suffix in {".jpg", ".jpeg"}:
            if image.mode != "RGB":
                image = image.convert("RGB")
            image.save(
                temporary_path,
                format="JPEG",
                quality=JPEG_QUALITY,
                optimize=True,
                progressive=True,
                subsampling=2,
            )
        elif suffix == ".png":
            image.save(temporary_path, format="PNG", optimize=True, compress_level=9)
        else:
            image.save(temporary_path, format="WEBP", quality=JPEG_QUALITY, method=6)

    try:
        with Image.open(temporary_path) as optimized:
            optimized.verify()
        optimized_size = temporary_path.stat().st_size
        if optimized_size >= original_size:
            return False
        saves_enough = optimized_size <= original_size * (1 - MIN_SIZE_REDUCTION)
        if not resized and not saves_enough:
            return False
        temporary_path.replace(path)
        return True
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, help="Image files or directories to optimize")
    parser.add_argument("--all", action="store_true", help="Optimize all supported images in fotos_inventario/")
    parser.add_argument("--changed-from", help="Optimize images changed since this Git revision")
    parser.add_argument("--changed-to", help="End revision for --changed-from (defaults to HEAD)")
    args = parser.parse_args()

    if args.changed_to and not args.changed_from:
        parser.error("--changed-to requires --changed-from")
    if args.all and (args.paths or args.changed_from):
        parser.error("--all cannot be combined with paths or Git revisions")
    if args.changed_from and args.paths:
        parser.error("Git revisions cannot be combined with explicit paths")

    if args.all:
        images = all_images()
    elif args.changed_from:
        images = changed_images(args.changed_from, args.changed_to or "HEAD")
    elif args.paths:
        images = []
        for path in args.paths:
            resolved = path if path.is_absolute() else REPO_ROOT / path
            if resolved.is_dir():
                images.extend(
                    candidate for candidate in resolved.rglob("*")
                    if candidate.is_file() and candidate.suffix.lower() in IMAGE_EXTS
                )
            elif resolved.is_file() and resolved.suffix.lower() in IMAGE_EXTS:
                images.append(resolved)
            else:
                parser.error(f"No es un archivo de imagen compatible: {path}")
    else:
        parser.error("Indica archivos, --all o --changed-from para elegir las fotos.")

    optimized = 0
    for image_path in sorted(set(images)):
        if optimize_image(image_path):
            optimized += 1
            print(f"Optimizada: {image_path.relative_to(REPO_ROOT).as_posix()}")
    print(f"Fotos revisadas: {len(images)}; optimizadas ahora: {optimized}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"Error al optimizar fotos: {error}", file=sys.stderr)
        raise SystemExit(1) from error
