#!/usr/bin/env python3
"""Render a PDF job's articles into chunk PDFs (cover + one per month) and
upload them to a Drive folder, for the pdf-render.yml GitHub Action.

This ports the pre-migration Apps Script PDF layout (backend/src/pdf.js) -
justified mosaic cover, optional "masked-title" cover, month dividers with
mosaic background and seasonal decorations, portrait/landscape article
layout - to Python + static HTML/CSS, rendered to PDF via headless Chromium
(Playwright) instead of Apps Script's proprietary HTML-to-PDF converter.
"""
import argparse
import base64
import io
import json
import math
import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from PIL import Image
from playwright.sync_api import sync_playwright

import blurb_print_spec

SCOPES = ["https://www.googleapis.com/auth/drive"]
REPO_ROOT = Path(__file__).resolve().parent.parent
SEASONAL_IMAGES_DIR = REPO_ROOT / "tools" / "images"
FONTS_DIR = REPO_ROOT / "tools" / "fonts"

MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

ARTICLE_IMG_MAX_DIM = 1400
COVER_MAX_DIM = 800
COVER_MASK_MAX_DIM = 240

FONT_FAMILIES = {
    'garamond': "'Garamond', 'EB Garamond', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    'palatino': "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    'baskerville': "'Baskerville', 'Baskerville Old Face', 'Hoefler Text', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    'didot': "'Didot', 'Didot LT STD', 'Bodoni MT', 'Hoefler Text', 'Times New Roman', serif",
    'caslon': "'Adobe Caslon Pro', 'Caslon', 'Garamond', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    'georgia': "Georgia, 'Times New Roman', serif",
    'optima': "'Optima', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def esc(value) -> str:
    if value is None:
        return ''
    return (
        str(value)
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&#039;')
    )


def normalize_multiline(value) -> str:
    text = '' if value is None else str(value)
    # Config/job values may contain literal "\n"/"\r\n" escape sequences (two
    # or four characters) rather than real newlines, e.g. when round-tripped
    # through JSON/Sheets as plain text - normalize both to a real newline.
    return text.replace('\\r\\n', '\n').replace('\\n', '\n')


def render_multiline(value) -> str:
    text = normalize_multiline(value)
    lines = text.replace('\r\n', '\n').split('\n')
    if len(lines) <= 1:
        return esc(text)
    return ''.join(f'<div>{esc(line)}</div>' for line in lines)


def render_svg_multiline(value, x: float, line_height_px: float) -> str:
    text = normalize_multiline(value)
    lines = text.replace('\r\n', '\n').split('\n')
    parts = []
    for index, line in enumerate(lines):
        dy = '0' if index == 0 else str(line_height_px)
        parts.append(f'<tspan x="{x}" dy="{dy}">{esc(line)}</tspan>')
    return ''.join(parts)


def clamp(value, lo, hi):
    return min(hi, max(lo, value))


def format_date_fr(date_str: str) -> str:
    d = datetime.strptime(date_str[:10], '%Y-%m-%d')
    return f"{d.day} {MONTHS_FR[d.month - 1]} {d.year}"


def format_datetime_fr(date_str: str) -> str:
    d = datetime.strptime(date_str[:10], '%Y-%m-%d')
    return f"Le {d.day:02d} {MONTHS_FR[d.month - 1]} {d.year}"


# ---------------------------------------------------------------------------
# Image fetching / resizing (mirrors Apps Script's resizeImageBlob)
# ---------------------------------------------------------------------------

PLACEHOLDER_MIN_BYTES = 10_000


def fetch_image_bytes(article: dict, callback_url: str, callback_token: str) -> Optional[bytes]:
    file_id = article.get('image_file_id')
    if not file_id:
        return None
    is_drive_thumbnail = '/' not in file_id
    if is_drive_thumbnail:
        url = f"https://drive.google.com/thumbnail?id={urllib.parse.quote(file_id)}&sz=w2000"
    else:
        qs = urllib.parse.urlencode({'path': 'pdf/render-image', 'token': callback_token, 'file_id': file_id})
        url = f"{callback_url}?{qs}"
    try:
        req = urllib.request.Request(url, headers=API_HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
    except Exception:
        return None
    # Drive's public thumbnail endpoint doesn't error on a missing/inaccessible
    # file - it silently serves a small generic "no preview" icon (HTTP 200).
    # Real photos requested at sz=w2000 are never this small, so treat an
    # implausibly tiny response as a failed fetch rather than real content
    # (a real placeholder icon repeating through the mosaic looked like a
    # gap in the masked-title cover text).
    if is_drive_thumbnail and len(data) < PLACEHOLDER_MIN_BYTES:
        return None
    return data


def resize_image_bytes(data: bytes, max_dim: int):
    """Returns (base64, mime_type, aspect_ratio) or None on failure."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            width, height = im.size
            if im.mode not in ('RGB', 'L'):
                im = im.convert('RGB')
            max_side = max(width, height)
            if max_dim and max_side > max_dim:
                scale = max_dim / max_side
                im = im.resize((max(1, round(width * scale)), max(1, round(height * scale))))
            buf = io.BytesIO()
            im.save(buf, format='JPEG', quality=87)
            return base64.b64encode(buf.getvalue()).decode('ascii'), 'image/jpeg', width / height
    except Exception:
        return None


def looks_like_screenshot(data: bytes) -> bool:
    """Heuristic: app/UI screenshots (e.g. a Famileo post screenshot mixed in
    among real photos) tend to have either a large light/white background or
    one flat dominant color covering most of the image - real family photos
    rarely do, even bright snow/beach shots (natural light still has some
    gradient/texture). Used to keep such images out of the cover mosaic,
    where a repeated flat-background tile reads as a gap in the masked-title
    text."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            thumb = im.convert('RGB').resize((32, 32))
            pixels = list(thumb.getdata())
            total = len(pixels)
            near_light = sum(1 for r, g, b in pixels if r > 230 and g > 230 and b > 230)
            quantized = {}
            for r, g, b in pixels:
                key = (r // 16, g // 16, b // 16)
                quantized[key] = quantized.get(key, 0) + 1
            dominant_fraction = max(quantized.values()) / total
            return (near_light / total) > 0.4 or dominant_fraction > 0.5
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Smart mosaic layout (justified rows) - ported from generateSmartMosaicLayout
# ---------------------------------------------------------------------------

def smart_mosaic_layout(images: list, total_width: float, total_height: float, gap: float) -> list:
    n = len(images)
    if n == 0:
        return []

    if n == 1:
        img = images[0]
        if img['aspectRatio'] > total_width / total_height:
            w = total_width
            h = w / img['aspectRatio']
        else:
            h = total_height
            w = h * img['aspectRatio']
        return [{'img': img, 'x': (total_width - w) / 2, 'y': (total_height - h) / 2, 'w': w, 'h': h}]

    container_aspect = total_width / total_height
    total_aspect_sum = sum(img['aspectRatio'] for img in images)
    num_rows = round(math.sqrt(total_aspect_sum / container_aspect))
    num_rows = max(1, min(num_rows, math.ceil(n / 2)))

    target_aspect_per_row = total_aspect_sum / num_rows
    rows = []
    current_row = []
    current_row_aspect = 0

    for img in images:
        if current_row and current_row_aspect >= target_aspect_per_row * 0.8 and len(rows) < num_rows - 1:
            rows.append(current_row)
            current_row = [img]
            current_row_aspect = img['aspectRatio']
        else:
            current_row.append(img)
            current_row_aspect += img['aspectRatio']
    if current_row:
        rows.append(current_row)

    row_weights = [1 / sum(img['aspectRatio'] for img in row) for row in rows]
    total_weight = sum(row_weights)
    available_height = total_height - (len(rows) - 1) * gap

    cells = []
    current_y = 0.0
    for r, row in enumerate(rows):
        row_height = (row_weights[r] / total_weight) * available_height
        row_aspect_sum = sum(img['aspectRatio'] for img in row)
        available_row_width = total_width - (len(row) - 1) * gap

        current_x = 0.0
        for img in row:
            cell_width = (img['aspectRatio'] / row_aspect_sum) * available_row_width
            cells.append({'img': img, 'x': current_x, 'y': current_y, 'w': cell_width, 'h': row_height})
            current_x += cell_width + gap

        current_y += row_height + gap

    return cells


def month_mosaic_html(images: list, layout: str = 'full') -> str:
    images = images[:12]
    if not images:
        return ''

    mosaic_width = 12 if layout == 'centered' else PAGE_CONTENT_WIDTH_CM
    mosaic_height = 12 if layout == 'centered' else PAGE_CONTENT_HEIGHT_CM
    gap = 0.1

    cols = 2 if len(images) <= 4 else (3 if len(images) <= 9 else 4)
    rows = math.ceil(len(images) / cols)

    cell_width = (mosaic_width - (cols - 1) * gap) / cols
    cell_height = (mosaic_height - (rows - 1) * gap) / rows

    html = ''
    idx = 0
    for r in range(rows):
        for c in range(cols):
            if idx >= len(images):
                break
            img = images[idx]
            x = c * (cell_width + gap)
            y = r * (cell_height + gap)
            html += (
                f'<div class="month-mosaic-cell" style="left:{x:.2f}cm; top:{y:.2f}cm; '
                f'width:{cell_width:.2f}cm; height:{cell_height:.2f}cm;">'
                f'<img src="data:{img["mimeType"]};base64,{img["base64"]}" alt="" /></div>'
            )
            idx += 1
    return html


# ---------------------------------------------------------------------------
# Seasonal fruits
# ---------------------------------------------------------------------------

def load_seasonal_images(month_index: int) -> list:
    month_dir = SEASONAL_IMAGES_DIR / f"{month_index + 1:02d}"
    if not month_dir.is_dir():
        return []
    images = []
    for path in sorted(month_dir.iterdir()):
        if path.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        ext = path.suffix.lower().lstrip('.')
        mime = 'image/png' if ext == 'png' else ('image/webp' if ext == 'webp' else 'image/jpeg')
        name = path.stem.rsplit('_', 1)[0].replace('_', ' ').title()
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        images.append({'data': f'data:{mime};base64,{data}', 'name': name})
    return images


def generate_seasonal_fruits(month_index: int) -> str:
    images = load_seasonal_images(month_index)
    if not images:
        return ''

    page_width = PAGE_CONTENT_WIDTH_CM
    page_height = PAGE_CONTENT_HEIGHT_CM
    perimeter = 2 * (page_width + page_height - 4)
    ideal_size = min(2.2, perimeter / len(images) * 0.8)
    img_size = max(1.4, ideal_size)

    pagination_reserve = 4.0
    top_length = page_width
    right_length = page_height - 5
    bottom_length = page_width - pagination_reserve
    left_length = page_height - 5
    total_length = top_length + right_length + bottom_length + left_length

    top_count = round(len(images) * top_length / total_length)
    right_count = round(len(images) * right_length / total_length)
    bottom_count = round(len(images) * bottom_length / total_length)
    left_count = len(images) - top_count - right_count - bottom_count

    positions = []

    for i in range(top_count):
        spacing = (page_width - img_size) / (top_count - 1) if top_count > 1 else (page_width - img_size) / 2
        positions.append({'x': i * spacing if top_count > 1 else spacing, 'y': 0.1, 'size': img_size})

    start_y, end_y = 2.5, page_height - pagination_reserve - 1
    for i in range(right_count):
        spacing = (end_y - start_y - img_size) / (right_count - 1) if right_count > 1 else 0
        y = start_y + (i * spacing if right_count > 1 else (end_y - start_y - img_size) / 2)
        positions.append({'x': page_width - img_size - 0.1, 'y': y, 'size': img_size})

    for i in range(bottom_count):
        available_width = page_width - pagination_reserve - img_size
        spacing = available_width / (bottom_count - 1) if bottom_count > 1 else available_width / 2
        positions.append({'x': i * spacing if bottom_count > 1 else spacing, 'y': page_height - img_size - 0.1, 'size': img_size})

    start_y, end_y = 2.5, page_height - 3
    for i in range(left_count):
        spacing = (end_y - start_y - img_size) / (left_count - 1) if left_count > 1 else 0
        y = start_y + (i * spacing if left_count > 1 else (end_y - start_y - img_size) / 2)
        positions.append({'x': 0.1, 'y': y, 'size': img_size})

    shuffled = images[:]
    random.shuffle(shuffled)

    html = ''
    for pos, img in zip(positions, shuffled):
        rotation = random.randint(-12, 12)
        html += (
            f'<div class="season-item" style="left:{pos["x"]:.2f}cm; top:{pos["y"]:.2f}cm; '
            f'width:{pos["size"]:.2f}cm; height:{pos["size"]:.2f}cm; transform: rotate({rotation}deg);">'
            f'<img src="{img["data"]}" alt="{esc(img["name"])}" /></div>'
        )
    return html


# ---------------------------------------------------------------------------
# Cover page
# ---------------------------------------------------------------------------

def generate_cover_mosaic(articles: list, date_from: str, date_to: str, max_photos: Optional[int], options: dict,
                          config: dict, callback_url: str, callback_token: str) -> str:
    family_name = options.get('family_name') or config.get('family_name')
    title_text = f"Livre de souvenir des {esc(family_name)}" if family_name else 'Livre de Souvenirs'

    images = []
    photo_limit = max_photos or len(articles)
    for article in articles:
        if len(images) >= photo_limit:
            break
        data = fetch_image_bytes(article, callback_url, callback_token)
        if not data or looks_like_screenshot(data):
            continue
        resized = resize_image_bytes(data, COVER_MAX_DIM)
        if resized:
            b64, mime, aspect = resized
            images.append({'base64': b64, 'mimeType': mime, 'aspectRatio': aspect})

    dates_text = f"Du {format_date_fr(date_from)} au {format_date_fr(date_to)}"

    if not images:
        return f'<div class="cover"><h1>{title_text}</h1><p class="dates">{dates_text}</p></div>'

    # 22cm was the original A4-derived height available for the mosaic below
    # the title block (27.7cm page minus ~5.7cm for the title/dates text).
    # Keep the same proportion of the page for other formats.
    mosaic_area_height = PAGE_CONTENT_HEIGHT_CM * (22 / 27.7)
    cells = smart_mosaic_layout(images, PAGE_CONTENT_WIDTH_CM, mosaic_area_height, 0.07)
    mosaic_html = ''.join(
        f'<div class="mosaic-cell" style="left:{c["x"]:.3f}cm; top:{c["y"]:.3f}cm; '
        f'width:{c["w"]:.3f}cm; height:{c["h"]:.3f}cm;">'
        f'<img src="data:{c["img"]["mimeType"]};base64,{c["img"]["base64"]}" alt="" /></div>'
        for c in cells
    )

    return f'''
  <div class="cover-mosaic">
    <div class="cover-title">
      <h1>{title_text}</h1>
      <p class="dates">{dates_text}</p>
    </div>
    <div class="mosaic-container">{mosaic_html}</div>
  </div>'''


def generate_cover_masked_text_html(options: dict, config: dict) -> str:
    # 3-tier resolution, matching the pre-migration Apps Script behavior:
    # per-job option -> D1 config value (tuned once, applies to every job) -> hardcoded fallback.
    def resolve_number(key, fallback, config_key=None):
        raw = options.get(key)
        if raw is None:
            raw = config.get(config_key or f'pdf_{key}')
        try:
            return float(raw) if raw is not None else fallback
        except (TypeError, ValueError):
            return fallback

    def resolve_font_family(key, fallback, config_key=None):
        raw = options.get(key)
        if not raw:
            raw = config.get(config_key or f'pdf_{key}')
        return FONT_FAMILIES.get(raw, fallback) if raw else fallback

    def resolve_font_weight(key, fallback, config_key=None):
        return clamp(resolve_number(key, fallback, config_key), 100, 900)

    family_mask_image_data_uri = options.get('_family_mask_image_data_uri', '')
    family_mask_enabled = bool(family_mask_image_data_uri)

    cover_title = options.get('cover_title') or config.get('pdf_cover_title') or 'test H1'
    cover_subtitle = options.get('cover_subtitle') or config.get('pdf_cover_subtitle') or 'test H2'

    family_letter_spacing_raw = (
        options.get('cover_family_letter_spacing_em')
        or options.get('cover_vertical_letter_spacing_em')
        or config.get('pdf_cover_vertical_letter_spacing')
    )
    try:
        family_letter_spacing_val = float(family_letter_spacing_raw) if family_letter_spacing_raw is not None else 0
    except (TypeError, ValueError):
        family_letter_spacing_val = 0
    family_letter_spacing = clamp(family_letter_spacing_val, -0.2, 0.2)
    title_letter_spacing = clamp(resolve_number('cover_title_letter_spacing_em', 0), -0.2, 0.2)
    subtitle_letter_spacing = clamp(resolve_number('cover_subtitle_letter_spacing_em', 0), -0.2, 0.2)

    title_x_cm = clamp(resolve_number('cover_title_x_cm', 8.5), 0, 18)
    title_y_cm = clamp(resolve_number('cover_title_y_cm', 9), 0, 27)
    title_font_cm = clamp(resolve_number('cover_title_h_cm', 0.99), 0.4, 2.5)
    title_font_family = resolve_font_family('cover_title_font_family', "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif")
    title_font_weight = resolve_font_weight('cover_title_font_weight', 700)

    subtitle_x_cm = clamp(resolve_number('cover_subtitle_x_cm', 8.5), 0, 18)
    subtitle_y_cm = clamp(resolve_number('cover_subtitle_y_cm', 12.2), 0, 27)
    subtitle_font_cm = clamp(resolve_number('cover_subtitle_h_cm', 0.85), 0.4, 2.5)
    subtitle_font_family = resolve_font_family('cover_subtitle_font_family', "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif")
    subtitle_font_weight = resolve_font_weight('cover_subtitle_font_weight', 700)

    family_x_cm = clamp(resolve_number('cover_family_x_cm', 5), 0, 12)
    family_font_cm = clamp(resolve_number('cover_family_h_cm', 3.5), 1.5, 6)
    family_font_px = family_font_cm * 100
    family_font_family = resolve_font_family('cover_family_font_family', "'Garamond', 'EB Garamond', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif")
    family_font_weight = resolve_font_weight('cover_family_font_weight', 700)
    family_mask_text = options.get('family_name') or config.get('family_name') or 'Souvenirs de famille'

    family_scale_x = clamp(resolve_number('cover_family_scale_x', 1), 0.6, 3)
    family_scale_y = clamp(resolve_number('cover_family_scale_y', 1), 0.6, 3)
    title_scale_x = clamp(resolve_number('cover_title_scale_x', 1), 0.6, 3)
    title_scale_y = clamp(resolve_number('cover_title_scale_y', 1), 0.6, 3)
    subtitle_scale_x = clamp(resolve_number('cover_subtitle_scale_x', 1), 0.6, 3)
    subtitle_scale_y = clamp(resolve_number('cover_subtitle_scale_y', 1), 0.6, 3)

    family_mask_width_px = max(1, round(2770 * family_scale_x))
    family_mask_height_px = max(1, round(family_font_px * family_scale_y))
    family_mask_width_cm = family_mask_width_px / 100
    family_mask_height_cm = family_mask_height_px / 100
    family_mask_trim_px = min(8, max(0, round(family_mask_height_px * 0.015)))
    family_mask_view_box_y = family_mask_trim_px
    family_mask_view_box_height_px = max(1, family_mask_height_px - family_mask_trim_px * 2)
    family_mask_baseline_px = max(1, round(family_font_px * 0.86 * family_scale_y))

    family_outline_raw = options.get('cover_family_outline_px')
    if family_outline_raw is None:
        family_outline_raw = config.get('pdf_cover_family_outline_px')
    try:
        family_outline_px = clamp(float(family_outline_raw), 0, 20) if family_outline_raw is not None else None
    except (TypeError, ValueError):
        family_outline_px = None
    if family_outline_px is None:
        family_outline_px = clamp(family_font_px * 0.007, 0.8, 2.2)

    family_text_scale_transform = (
        f'translate(0 {family_mask_baseline_px}) scale({family_scale_x} {family_scale_y}) '
        f'translate(0 {-family_mask_baseline_px})'
    )
    family_clip_id = 'coverFamilyClip'

    family_mask_svg = ''
    if family_mask_enabled:
        family_mask_svg = f'''
      <svg width="{family_mask_width_cm}cm" height="{family_mask_height_cm}cm" viewBox="0 {family_mask_view_box_y} {family_mask_width_px} {family_mask_view_box_height_px}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <defs>
          <clipPath id="{family_clip_id}">
            <text x="0" y="{family_mask_baseline_px}" text-anchor="start" dominant-baseline="alphabetic"
                  font-family="{family_font_family}" font-weight="{family_font_weight}" font-size="{family_font_px}"
                  letter-spacing="{family_letter_spacing}em"
                  transform="{family_text_scale_transform}">
              {render_svg_multiline(family_mask_text, 0, family_font_px)}
            </text>
          </clipPath>
        </defs>
        <g clip-path="url(#{family_clip_id})">
          <image x="0" y="0" width="{family_mask_height_px}" height="{family_mask_width_px}"
                 href="{family_mask_image_data_uri}"
                 preserveAspectRatio="xMidYMid slice"
                 transform="matrix(0 1 -1 0 {family_mask_width_px} 0)" />
        </g>
        <text x="0" y="{family_mask_baseline_px}" text-anchor="start" dominant-baseline="alphabetic"
              font-family="{family_font_family}" font-weight="{family_font_weight}" font-size="{family_font_px}"
              letter-spacing="{family_letter_spacing}em"
              transform="{family_text_scale_transform}"
              fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="{family_outline_px}" stroke-linejoin="round" paint-order="stroke fill">
          {render_svg_multiline(family_mask_text, 0, family_font_px)}
        </text>
      </svg>'''

    fallback_family_block = ''
    if not family_mask_enabled:
        fallback_family_block = f'''<div style="position:absolute; inset:0; color:#000; font-family: {family_font_family}; font-weight:{family_font_weight}; font-size:{family_font_cm}cm; letter-spacing:{family_letter_spacing}em; line-height:1; z-index:30;">
      <div style="position:absolute; left:{family_x_cm}cm; bottom:0.2cm; width:{PAGE_CONTENT_HEIGHT_CM}cm; white-space:nowrap; transform: rotate(-90deg) scaleX({family_scale_x}) scaleY({family_scale_y}); transform-origin: left bottom;">
        {render_multiline(family_mask_text)}
      </div>
    </div>'''

    masked_family_block = ''
    if family_mask_enabled:
        masked_family_block = f'''<div style="position:absolute; left:{family_x_cm}cm; bottom:0.2cm; width:{family_mask_width_cm}cm; height:{family_mask_height_cm}cm; white-space:nowrap; transform: rotate(-90deg); transform-origin: left bottom; overflow:hidden; z-index:20;">
      {family_mask_svg}
    </div>'''

    return f'''
  <div class="cover-mask-layout" style="width: {PAGE_CONTENT_WIDTH_CM}cm; height: {PAGE_CONTENT_HEIGHT_CM}cm; position: relative;">
    <svg width="{PAGE_CONTENT_WIDTH_CM}cm" height="{PAGE_CONTENT_HEIGHT_CM}cm" viewBox="0 0 {round(PAGE_CONTENT_WIDTH_CM * 100)} {round(PAGE_CONTENT_HEIGHT_CM * 100)}" xmlns="http://www.w3.org/2000/svg" style="position:absolute; inset:0;">
      <rect width="100%" height="100%" fill="#ffffff" />
    </svg>
    {fallback_family_block}
    <div style="position:absolute; left:{title_x_cm}cm; top:{title_y_cm}cm; max-width:{PAGE_CONTENT_WIDTH_CM}cm; color:#000; font-family: {title_font_family}; font-weight:{title_font_weight}; font-size:{title_font_cm}cm; letter-spacing:{title_letter_spacing}em; z-index:30;">
      <span style="display:inline-block; transform: scaleX({title_scale_x}) scaleY({title_scale_y}); transform-origin: left top;">
        {render_multiline(cover_title)}
      </span>
    </div>
    <div style="position:absolute; left:{subtitle_x_cm}cm; top:{subtitle_y_cm}cm; max-width:{PAGE_CONTENT_WIDTH_CM}cm; color:#000; font-family: {subtitle_font_family}; font-weight:{subtitle_font_weight}; font-size:{subtitle_font_cm}cm; letter-spacing:{subtitle_letter_spacing}em; z-index:30;">
      <span style="display:inline-block; transform: scaleX({subtitle_scale_x}) scaleY({subtitle_scale_y}); transform-origin: left top;">
        {render_multiline(cover_subtitle)}
      </span>
    </div>
    {masked_family_block}
  </div>'''


def generate_cover_masked_mosaic(articles: list, max_photos: Optional[int], options: dict, config: dict,
                                 callback_url: str, callback_token: str) -> str:
    images = []
    photo_limit = max_photos or len(articles)
    for article in articles:
        if len(images) >= photo_limit:
            break
        data = fetch_image_bytes(article, callback_url, callback_token)
        if not data or looks_like_screenshot(data):
            continue
        resized = resize_image_bytes(data, COVER_MASK_MAX_DIM)
        if resized:
            b64, mime, aspect = resized
            images.append({'base64': b64, 'mimeType': mime, 'aspectRatio': aspect})

    family_height_raw = options.get('cover_family_h_cm') or config.get('pdf_cover_family_h_cm')
    family_height_cm = clamp(float(family_height_raw) if family_height_raw is not None else 3.5, 1.5, 6)

    # Must mirror the scale applied to the text mask box in generate_cover_masked_text_html
    # (family_mask_height_px / family_mask_width_px). Otherwise this strip gets built at one
    # aspect ratio/size and then silently cropped+repositioned ("slice") to fit the differently
    # shaped box the text function embeds it into, throwing off the photo-to-glyph alignment.
    def resolve_family_scale(key, config_key):
        raw = options.get(key)
        if raw is None:
            raw = config.get(config_key)
        try:
            return clamp(float(raw), 0.6, 3) if raw is not None else 1.0
        except (TypeError, ValueError):
            return 1.0

    family_scale_x = resolve_family_scale('cover_family_scale_x', 'pdf_cover_family_scale_x')
    family_scale_y = resolve_family_scale('cover_family_scale_y', 'pdf_cover_family_scale_y')

    page_width_cm = family_height_cm * family_scale_y
    page_height_cm = PAGE_CONTENT_HEIGHT_CM * family_scale_x
    gap = 0.07
    target_cell_count = max(len(images), 90)

    mask_uri = ''
    if images:
        tiled = images[:]
        while len(tiled) < target_cell_count:
            tiled.append(images[len(tiled) % len(images)])
        cells = smart_mosaic_layout(tiled, page_width_cm, page_height_cm, gap)
        scale = 100
        mosaic_svg = ''.join(
            f'<image x="{c["x"] * scale:.1f}" y="{c["y"] * scale:.1f}" width="{c["w"] * scale:.1f}" '
            f'height="{c["h"] * scale:.1f}" href="data:{c["img"]["mimeType"]};base64,{c["img"]["base64"]}" '
            f'preserveAspectRatio="xMidYMid slice" />'
            for c in cells
        )
        strip_w = round(page_width_cm * 100)
        strip_h = round(page_height_cm * 100)
        svg_doc = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{strip_w}" height="{strip_h}" '
            f'viewBox="0 0 {strip_w} {strip_h}">{mosaic_svg}</svg>'
        )
        mask_uri = 'data:image/svg+xml;charset=utf-8,' + urllib.parse.quote(svg_doc)

    merged_options = {**options, '_family_mask_image_data_uri': mask_uri}
    return generate_cover_masked_text_html(merged_options, config)


def generate_cover_html(articles: list, date_from: str, date_to: str, options: dict, config: dict,
                        callback_url: str, callback_token: str) -> str:
    max_photos = options.get('max_mosaic_photos')
    style = options.get('cover_style') or 'mosaic'
    if style == 'masked-title':
        cover_html = generate_cover_masked_mosaic(articles, max_photos, options, config, callback_url, callback_token)
    else:
        cover_html = generate_cover_mosaic(articles, date_from, date_to, max_photos, options, config, callback_url, callback_token)

    return f'''<!doctype html>
<html>
<head><meta charset="utf-8"><style>{build_page_css()}</style></head>
<body>{cover_html}</body>
</html>'''


# ---------------------------------------------------------------------------
# Blurb print-ready cover wrap (front + spine + back, one flat canvas)
# ---------------------------------------------------------------------------

def _blurb_front_panel_html(articles: list, date_from: str, date_to: str, options: dict, config: dict,
                             callback_url: str, callback_token: str, panel_w_cm: float, panel_h_cm: float) -> str:
    """Reuses the existing front-cover generators (mosaic / masked-title),
    temporarily pointing PAGE_CONTENT_WIDTH/HEIGHT at the wrap's front panel
    size instead of the interior page size, then restores it - these
    generators read the page-size globals rather than taking width/height
    parameters directly."""
    saved_w, saved_h = PAGE_CONTENT_WIDTH_CM, PAGE_CONTENT_HEIGHT_CM
    set_page_dimensions(panel_w_cm, panel_h_cm)
    try:
        max_photos = options.get('max_mosaic_photos')
        style = options.get('cover_style') or 'mosaic'
        if style == 'masked-title':
            return generate_cover_masked_mosaic(articles, max_photos, options, config, callback_url, callback_token)
        return generate_cover_mosaic(articles, date_from, date_to, max_photos, options, config, callback_url, callback_token)
    finally:
        set_page_dimensions(saved_w, saved_h)


def _blurb_back_panel_html(articles: list, options: dict, callback_url: str, callback_token: str,
                            panel_w_cm: float, panel_h_cm: float, mosaic_max_photos: int) -> str:
    style = options.get('blurb_back_cover_style') or 'color'
    if style != 'mosaic':
        return ''

    images = []
    limit = len(articles) if mosaic_max_photos is None or mosaic_max_photos < 0 else mosaic_max_photos
    for article in articles:
        if len(images) >= limit:
            break
        data = fetch_image_bytes(article, callback_url, callback_token)
        if not data or looks_like_screenshot(data):
            continue
        resized = resize_image_bytes(data, COVER_MAX_DIM)
        if resized:
            b64, mime, aspect = resized
            images.append({'base64': b64, 'mimeType': mime, 'aspectRatio': aspect})

    if not images:
        return ''

    cells = smart_mosaic_layout(images, panel_w_cm, panel_h_cm, 0.07)
    return ''.join(
        f'<div class="mosaic-cell" style="left:{c["x"]:.3f}cm; top:{c["y"]:.3f}cm; '
        f'width:{c["w"]:.3f}cm; height:{c["h"]:.3f}cm;">'
        f'<img src="data:{c["img"]["mimeType"]};base64,{c["img"]["base64"]}" alt="" /></div>'
        for c in cells
    )


def generate_blurb_cover_html(articles: list, date_from: str, date_to: str, options: dict, config: dict,
                               callback_url: str, callback_token: str, format_key: str, cover_type: str,
                               paper_type: str, page_count: int) -> str:
    """Assembles the print-ready cover wrap (back panel | spine | front
    panel, one flat canvas) per blurb_print_spec's geometry, reusing the
    existing front-cover mosaic/masked-title generators for the front panel."""
    bleed_in = blurb_print_spec.BLEED_IN[cover_type]
    panel_w_in, panel_h_in = blurb_print_spec.panel_dimensions_in(format_key, cover_type)
    spine_w_in = blurb_print_spec.spine_width_in(page_count, cover_type, paper_type)
    safe_zone_in = blurb_print_spec.SAFE_ZONE_MARGIN_IN

    bleed_cm = blurb_print_spec.inch_to_cm(bleed_in)
    panel_w_cm = blurb_print_spec.inch_to_cm(panel_w_in)
    panel_h_cm = blurb_print_spec.inch_to_cm(panel_h_in)
    spine_w_cm = blurb_print_spec.inch_to_cm(spine_w_in)
    safe_zone_cm = blurb_print_spec.inch_to_cm(safe_zone_in)
    barcode_w_cm = blurb_print_spec.inch_to_cm(blurb_print_spec.BARCODE_AREA_IN[0])
    barcode_h_cm = blurb_print_spec.inch_to_cm(blurb_print_spec.BARCODE_AREA_IN[1])
    barcode_margin_side_cm = blurb_print_spec.inch_to_cm(blurb_print_spec.BARCODE_MARGIN_FROM_SPINE_SIDE_IN)
    barcode_margin_bottom_cm = blurb_print_spec.inch_to_cm(blurb_print_spec.BARCODE_MARGIN_FROM_BOTTOM_IN)

    full_w_cm = 2 * panel_w_cm + spine_w_cm + 2 * bleed_cm
    full_h_cm = panel_h_cm + 2 * bleed_cm

    back_x_cm = 0.0
    spine_x_cm = bleed_cm + panel_w_cm
    front_x_cm = bleed_cm + panel_w_cm + spine_w_cm

    front_bg_color = options.get('blurb_front_bg_color') or '#ffffff'
    back_bg_color = options.get('blurb_back_bg_color') or '#ffffff'
    spine_bg_color = options.get('blurb_spine_bg_color') or '#ffffff'
    mosaic_max_photos = options.get('blurb_back_cover_mosaic_max_photos')

    front_inner_html = _blurb_front_panel_html(
        articles, date_from, date_to, options, config, callback_url, callback_token, panel_w_cm, panel_h_cm
    )
    back_inner_html = _blurb_back_panel_html(
        articles, options, callback_url, callback_token, panel_w_cm, panel_h_cm, mosaic_max_photos
    )

    # Spine text: only rendered if it fits legibly at the requested font size.
    # A single line of text needs roughly its font size in width to read at
    # all once rotated onto the spine - below that, skip it entirely rather
    # than render illegible/overlapping text.
    spine_text = (options.get('blurb_spine_text') or '').strip()
    spine_font_cm = float(options.get('blurb_spine_font_size_cm') or 0.5)
    spine_fits = bool(spine_text) and spine_w_cm >= max(spine_font_cm, 0.3)
    spine_text_html = ''
    if spine_fits:
        # A -90deg rotation with transform-origin "left bottom" shifts the
        # box LEFT by roughly its own (unrotated) line-height once rotated -
        # positioning it at left:0 pushes it off-page to the left. Centering
        # it at spine_w_cm/2 (plus a half-line-height nudge, approximated
        # from font size) keeps it within the spine regardless of exact
        # font metrics. Verified empirically by measuring the rotated box's
        # bounding rect with Playwright.
        spine_left_cm = spine_w_cm / 2 + spine_font_cm * 0.6
        spine_text_html = f'''<div style="position:absolute; left:{spine_left_cm}cm; bottom:0.3cm; width:{panel_h_cm}cm; white-space:nowrap; transform: rotate(-90deg); transform-origin: left bottom; text-align:center; font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif; font-size:{spine_font_cm}cm; color:#000;">
      {esc(spine_text)}
    </div>'''

    return f'''<!doctype html>
<html>
<head><meta charset="utf-8"><style>{_font_face_css()}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
@page {{ size: {full_w_cm}cm {full_h_cm}cm; margin: 0; }}
body {{ font-family: Arial, sans-serif; }}
.blurb-cover-canvas {{ position: relative; width: {full_w_cm}cm; height: {full_h_cm}cm; overflow: hidden; }}
.blurb-panel {{ position: absolute; top: 0; height: {full_h_cm}cm; overflow: hidden; }}
.blurb-safe-zone {{ position: absolute; overflow: hidden; }}
.mosaic-cell {{ position: absolute; overflow: hidden; }}
.mosaic-cell img {{ width: 100%; height: 100%; object-fit: cover; }}
</style></head>
<body>
  <div class="blurb-cover-canvas">
    <div class="blurb-panel" style="left:{back_x_cm}cm; width:{bleed_cm + panel_w_cm}cm; background:{back_bg_color};">
      <div class="blurb-safe-zone" style="left:{bleed_cm + safe_zone_cm}cm; top:{bleed_cm + safe_zone_cm}cm; width:{panel_w_cm - 2 * safe_zone_cm}cm; height:{panel_h_cm - 2 * safe_zone_cm}cm;">
        {back_inner_html}
      </div>
      <div style="position:absolute; right:{barcode_margin_side_cm}cm; bottom:{bleed_cm + barcode_margin_bottom_cm}cm; width:{barcode_w_cm}cm; height:{barcode_h_cm}cm; background:#ffffff;"></div>
    </div>
    <div class="blurb-panel" style="left:{spine_x_cm}cm; width:{spine_w_cm}cm; background:{spine_bg_color};">
      {spine_text_html}
    </div>
    <div class="blurb-panel" style="left:{front_x_cm}cm; width:{panel_w_cm + bleed_cm}cm; background:{front_bg_color};">
      <div style="position:absolute; left:0; top:0; width:{panel_w_cm}cm; height:{panel_h_cm}cm; overflow:hidden;">
        {front_inner_html}
      </div>
    </div>
  </div>
</body>
</html>'''


# ---------------------------------------------------------------------------
# Month pages
# ---------------------------------------------------------------------------

def generate_month_divider(month_articles: list, month_year_label: str, month_index: int,
                           current_page: int, total_pages: int, options: dict,
                           callback_url: str, callback_token: str) -> str:
    mosaic_layout = options.get('mosaic_layout') or 'full'
    show_seasonal_fruits = options.get('show_seasonal_fruits', True)
    article_count = len(month_articles)

    images = []
    for article in month_articles:
        if len(images) >= 12:
            break
        data = fetch_image_bytes(article, callback_url, callback_token)
        if not data or looks_like_screenshot(data):
            continue
        resized = resize_image_bytes(data, COVER_MAX_DIM)
        if resized:
            b64, mime, aspect = resized
            images.append({'base64': b64, 'mimeType': mime, 'aspectRatio': aspect})

    mosaic_html = month_mosaic_html(images, mosaic_layout)
    fruits_html = generate_seasonal_fruits(month_index) if show_seasonal_fruits else ''
    plural = 's' if article_count > 1 else ''

    if mosaic_layout == 'centered':
        return f'''
  <div class="month-divider month-divider-centered">
    <div class="season-decorations">{fruits_html}</div>
    <div class="month-title-container-centered">
      <h2 class="month-title">{esc(month_year_label)}</h2>
      <p class="month-subtitle">{article_count} souvenir{plural}</p>
    </div>
    <div class="month-mosaic-centered">{mosaic_html}</div>
    <div class="page-number">{current_page} / {total_pages}</div>
  </div>'''

    return f'''
  <div class="month-divider">
    <div class="month-mosaic-bg">{mosaic_html}</div>
    <div class="season-decorations">{fruits_html}</div>
    <div class="month-title-container">
      <h2 class="month-title">{esc(month_year_label)}</h2>
      <p class="month-subtitle">{article_count} souvenir{plural}</p>
    </div>
    <div class="page-number">{current_page} / {total_pages}</div>
  </div>'''


def render_article(article: dict, callback_url: str, callback_token: str) -> str:
    date_str = format_datetime_fr(article.get('date', ''))
    image_html = ''
    is_portrait = False

    data = fetch_image_bytes(article, callback_url, callback_token)
    if data:
        resized = resize_image_bytes(data, ARTICLE_IMG_MAX_DIM)
        if resized:
            b64, mime, aspect_ratio = resized
            image_html = f'<img src="data:{mime};base64,{b64}" alt="" />'
            is_portrait = aspect_ratio < 1

    text_html = esc(article.get('texte', ''))

    if is_portrait:
        return f'''
    <div class="article">
      <div class="article-content portrait">
        <div class="article-image">{image_html}</div>
        <div class="article-right">
          <div class="article-date">{date_str}</div>
          {f'<div class="article-text">{text_html}</div>' if text_html else ''}
        </div>
      </div>
    </div>'''

    return f'''
    <div class="article">
      <div class="article-content landscape">
        <div class="article-image">{image_html}</div>
        <div class="article-bottom">
          <div class="article-date">{date_str}</div>
          {f'<div class="article-text">{text_html}</div>' if text_html else ''}
        </div>
      </div>
    </div>'''


def generate_month_chunk_html(month_articles: list, month_year_label: str, month_index: int,
                              start_page: int, total_pages: int, options: dict,
                              callback_url: str, callback_token: str) -> str:
    current_page = start_page + 1
    divider_html = generate_month_divider(
        month_articles, month_year_label, month_index, current_page, total_pages,
        options, callback_url, callback_token,
    )

    pages_html = ''
    for i in range(0, len(month_articles), 2):
        current_page += 1
        pages_html += '\n  <div class="articles-page">\n'
        pages_html += render_article(month_articles[i], callback_url, callback_token)
        if i + 1 < len(month_articles):
            pages_html += render_article(month_articles[i + 1], callback_url, callback_token)
        pages_html += f'\n    <div class="page-number">{current_page} / {total_pages}</div>\n  </div>\n'

    return f'''<!doctype html>
<html>
<head><meta charset="utf-8"><style>{build_page_css()}</style></head>
<body>
{divider_html}
{pages_html}
</body>
</html>'''


# ---------------------------------------------------------------------------
# Cover fonts (bundled substitutes, see tools/fonts/README.md)
#
# The GitHub Actions runner has none of Garamond/Palatino/Didot installed, so
# Chromium fell back to a generic serif with different glyph metrics than the
# baseline/scale math below was tuned for - visible as a gap in the
# masked-title cover's vertical text. These free, metric/style-compatible
# fonts are aliased under the exact family names already used in the CSS
# below, so no other code needs to change.
# ---------------------------------------------------------------------------

def _font_face_css() -> str:
    faces = [
        ("EB Garamond", "EBGaramond-Regular.ttf", "truetype", "400 800"),
        ("Palatino Linotype", "TeXGyrePagella-Regular.otf", "opentype", "400"),
        ("Palatino Linotype", "TeXGyrePagella-Bold.otf", "opentype", "700 900"),
        ("Didot", "GFSDidot-Regular.ttf", "truetype", "400 900"),
    ]
    blocks = []
    for family, filename, fmt, weight_range in faces:
        path = FONTS_DIR / filename
        if not path.is_file():
            continue
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        mime = 'font/ttf' if fmt == 'truetype' else 'font/otf'
        blocks.append(
            f"@font-face {{ font-family: '{family}'; "
            f"src: url(data:{mime};base64,{data}) format('{fmt}'); "
            f"font-weight: {weight_range}; font-display: swap; }}"
        )
    return '\n'.join(blocks)


# ---------------------------------------------------------------------------
# CSS (ported verbatim from backend/src/pdf.js getPdfStyles())
# ---------------------------------------------------------------------------

# Page content-area dimensions in cm - i.e. the physical page (trim) size
# minus the @page margin. Default to the pre-Blurb A4-derived content area
# (A4 21x29.7cm minus a 1cm margin on every side = 19x27.7cm). Overridden
# once per job in main() via set_page_dimensions() when Blurb mode is
# enabled, using the selected format's trim size (see blurb_print_spec.py).
# Every hardcoded "27.7"/"19" page-height/width reference in this file
# reads these instead of a literal, so the whole interior layout follows
# whatever format was selected without forking the templates.
PAGE_MARGIN_CM = 1.0
PAGE_CONTENT_WIDTH_CM = 19.0
PAGE_CONTENT_HEIGHT_CM = 27.7


def set_page_dimensions(content_width_cm: float, content_height_cm: float) -> None:
    global PAGE_CONTENT_WIDTH_CM, PAGE_CONTENT_HEIGHT_CM
    PAGE_CONTENT_WIDTH_CM = content_width_cm
    PAGE_CONTENT_HEIGHT_CM = content_height_cm


def build_page_css() -> str:
    page_width_cm = PAGE_CONTENT_WIDTH_CM + 2 * PAGE_MARGIN_CM
    page_height_cm = PAGE_CONTENT_HEIGHT_CM + 2 * PAGE_MARGIN_CM
    return _font_face_css() + f"""
@page {{ size: {page_width_cm}cm {page_height_cm}cm; margin: {PAGE_MARGIN_CM}cm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; }}

.cover {{ page-break-after: always; text-align: center; padding-top: 8cm; }}
.cover h1 {{ font-size: 40pt; margin-bottom: 0.9cm; font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif; letter-spacing: 0.02em; }}
.cover .dates {{ font-size: 20pt; color: #666; font-family: "Optima", "Segoe UI", "Helvetica Neue", Arial, sans-serif; }}

.cover-mosaic {{ height: {PAGE_CONTENT_HEIGHT_CM}cm; display: flex; flex-direction: column; }}
.cover-title {{ text-align: center; padding: 0.5cm 0 0.8cm 0; flex-shrink: 0; }}
.cover-title h1 {{ font-size: 30pt; margin: 0 0 0.35cm 0; color: #2b2b2b; font-weight: 700; font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif; letter-spacing: 0.03em; }}
.cover-title .dates {{ font-size: 15pt; color: #555; margin: 0; font-family: "Optima", "Segoe UI", "Helvetica Neue", Arial, sans-serif; }}

.mosaic-container {{ flex: 1; position: relative; overflow: hidden; }}
.mosaic-cell {{ position: absolute; overflow: hidden; }}
.mosaic-cell img {{ width: 100%; height: 100%; object-fit: cover; }}

.articles-page {{ page-break-before: always; height: {PAGE_CONTENT_HEIGHT_CM}cm; display: flex; flex-direction: column; gap: 0.4cm; }}
.article {{ flex: 1; border: 1px solid #ccc; display: flex; flex-direction: column; overflow: hidden; max-height: 13.5cm; }}
.article:nth-child(2) {{ margin-top: 0.2cm; }}
.article-content {{ flex: 1; display: flex; overflow: hidden; }}

.article-content.landscape {{ flex-direction: column; align-items: stretch; }}
.article-content.landscape .article-image {{ width: 100%; display: flex; justify-content: center; }}
.article-content.landscape .article-image img {{ width: 100%; max-height: 9.5cm; object-fit: contain; object-position: center top; }}
.article-content.landscape .article-bottom {{ display: flex; flex-direction: row; align-items: center; gap: 0.5cm; padding: 0.3cm; }}
.article-content.landscape .article-date {{ flex-shrink: 0; }}
.article-content.landscape .article-text {{ flex: 1; }}

.article-content.portrait {{ flex-direction: row; align-items: stretch; }}
.article-content.portrait .article-image {{ flex-shrink: 0; display: flex; align-items: stretch; margin-right: 0.4cm; }}
.article-content.portrait .article-image img {{ height: 100%; max-width: 10cm; object-fit: contain; object-position: left top; }}
.article-content.portrait .article-right {{ flex: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 0.3cm; padding: 0.3cm 0.3cm 0.3cm 0; }}

.article-date {{ font-size: 11pt; color: #3366cc; font-weight: 500; }}
.article-text {{ font-size: 13pt; line-height: 1.4; }}

.page-number {{ text-align: right; font-size: 10pt; color: #666; padding-top: 0.3cm; }}
.articles-page .page-number {{ margin-top: auto; align-self: flex-end; }}

.month-divider {{ page-break-before: always; position: relative; height: {PAGE_CONTENT_HEIGHT_CM}cm; overflow: hidden; }}
.month-divider .page-number {{ position: absolute; bottom: 0; right: 0; z-index: 10; }}
.month-mosaic-bg {{ position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0.15; }}
.month-mosaic-cell {{ position: absolute; overflow: hidden; }}
.month-mosaic-cell img {{ width: 100%; height: 100%; object-fit: cover; }}

.month-title-container {{ position: absolute; top: 40%; left: 0; right: 0; text-align: center; transform: translateY(-50%); z-index: 5; }}
.month-title {{ font-size: 42pt; font-weight: bold; color: #333; margin: 0 0 0.5cm 0; text-shadow: 2px 2px 4px rgba(255,255,255,0.8); }}
.month-subtitle {{ font-size: 16pt; color: #666; margin: 0; }}

.month-divider-centered .month-title-container-centered {{ position: absolute; top: 8%; left: 0; right: 0; text-align: center; z-index: 5; }}

.season-decorations {{ position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 3; }}
.season-item {{ position: absolute; }}
.season-item img {{ width: 100%; height: 100%; object-fit: contain; }}

.month-mosaic-centered {{ position: absolute; top: 32%; left: 50%; transform: translateX(-50%); width: 12cm; height: 12cm; border-radius: 0.15cm; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }}
.month-mosaic-centered .month-mosaic-cell {{ position: absolute; }}
.month-mosaic-centered .month-mosaic-cell img {{ width: 100%; height: 100%; object-fit: cover; }}
"""


# ---------------------------------------------------------------------------
# Drive plumbing (unchanged from the original render pipeline)
# ---------------------------------------------------------------------------

API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
}


def get_drive_service(credentials_path: str, token_path: str, use_console: bool):
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if use_console and os.getenv("GITHUB_ACTIONS") == "true":
            raise SystemExit("No valid token.json found in CI. Re-auth locally to refresh token.json.")
        flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
        creds = flow.run_local_server(port=0, open_browser=not use_console)
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    return build("drive", "v3", credentials=creds)


def api_call(callback_url: str, path: str, params: dict, method: str = "GET"):
    qs = urllib.parse.urlencode({"path": path, **params})
    url = f"{callback_url}?{qs}"
    req = urllib.request.Request(url, method=method, headers=API_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"{path} failed: HTTP {exc.code} {body}")
    if not payload.get("ok"):
        raise SystemExit(f"{path} failed: {payload}")
    return payload.get("data", {})


def fetch_job(callback_url: str, token: str, job_id: str):
    data = api_call(callback_url, "pdf/render-job", {"token": token, "job_id": job_id})
    return data["job"], data.get("articles", []), data.get("config", {})


def report_status(callback_url: str, token: str, job_id: str, progress: int, message: str):
    api_call(callback_url, "pdf/render-status", {
        "token": token, "job_id": job_id, "progress": str(progress), "message": message,
    })


def report_complete(callback_url: str, token: str, job_id: str, folder_id: str, folder_url: str):
    api_call(callback_url, "pdf/render-complete", {
        "token": token, "job_id": job_id, "folder_id": folder_id, "folder_url": folder_url,
    })


def report_failed(callback_url: str, token: str, job_id: str, message: str):
    api_call(callback_url, "pdf/render-failed", {
        "token": token, "job_id": job_id, "message": message[:1500],
    })


def find_or_create_folder(service, name: str, parent_id: Optional[str]) -> str:
    parent_clause = f"'{parent_id}' in parents and " if parent_id else ""
    q = f"{parent_clause}name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=q, fields="files(id,name)").execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]
    metadata = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        metadata["parents"] = [parent_id]
    folder = service.files().create(body=metadata, fields="id").execute()
    return folder["id"]


def create_job_chunks_folder(service, job_id: str):
    rememly_id = find_or_create_folder(service, "Rememly", None)
    pdf_id = find_or_create_folder(service, "pdf", rememly_id)
    metadata = {
        "name": f"chunks_{job_id[:8]}",
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [pdf_id],
    }
    folder = service.files().create(body=metadata, fields="id,webViewLink").execute()
    return folder["id"], folder.get("webViewLink", "")


def upload_pdf(service, folder_id: str, name: str, data: bytes):
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype="application/pdf", resumable=True)
    metadata = {"name": name, "parents": [folder_id]}
    created = service.files().create(body=metadata, media_body=media, fields="id").execute()
    return created["id"]


def render_html_to_pdf(browser, html_content: str) -> bytes:
    page = browser.new_page()
    try:
        page.set_content(html_content, wait_until="load", timeout=60000)
        # @font-face fonts load asynchronously and don't block the "load"
        # event (especially with font-display: swap) - without this, the PDF
        # can be captured mid-swap, using fallback-font metrics instead of
        # the bundled fonts, which showed up as an inconsistent gap in the
        # masked-title cover's vertical text between renders.
        page.evaluate("document.fonts.ready")
        page.wait_for_function("document.fonts.status === 'loaded'", timeout=15000)
        # prefer_css_page_size is required for the @page CSS rule to actually
        # control the output page size - without it, Playwright silently
        # defaults to Letter (21.59x27.94cm) regardless of @page, which was
        # true even before Blurb mode existed (today's "A4" pages have
        # actually always come out at Letter size). Confirmed by rendering a
        # custom @page size with and without this flag and measuring the
        # resulting PDF's MediaBox.
        return page.pdf(print_background=True, prefer_css_page_size=True)
    finally:
        page.close()


def month_label(key: str) -> str:
    try:
        year, month = key.split('-')
        return f"{MONTHS_FR[int(month) - 1].capitalize()} {year}"
    except Exception:
        return key


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Render PDF job chunks and upload to Drive.")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--credentials", default="credentials.json")
    parser.add_argument("--token", default="token.json")
    parser.add_argument("--no-browser", action="store_true", help="Use console OAuth flow (no local browser)")
    parser.add_argument("--callback-url", required=True)
    parser.add_argument("--callback-token", required=True)
    args = parser.parse_args()

    job, articles, config = fetch_job(args.callback_url, args.callback_token, args.job_id)
    options = json.loads(job.get('options_json') or '{}')

    blurb_mode = bool(options.get('blurb_mode_enabled'))
    blurb_format = options.get('blurb_format') or 'magazine_premium'
    blurb_cover_type = options.get('blurb_cover_type') or 'softcover'
    blurb_paper_type = options.get('blurb_paper_type') or '100# Text, Gloss'

    if blurb_mode:
        trim_w_in, trim_h_in = blurb_print_spec.TRIM_SIZES_IN[blurb_format]
        content_w_cm = blurb_print_spec.inch_to_cm(trim_w_in) - 2 * PAGE_MARGIN_CM
        content_h_cm = blurb_print_spec.inch_to_cm(trim_h_in) - 2 * PAGE_MARGIN_CM
        set_page_dimensions(content_w_cm, content_h_cm)

    try:
        by_month = defaultdict(list)
        for article in articles:
            key = (article.get('date') or '')[:7] or 'unknown'
            by_month[key].append(article)
        months = sorted(by_month.keys())

        page_counts = {key: 1 + math.ceil(len(by_month[key]) / 2) for key in months}
        total_pages = sum(page_counts.values())

        # RPI Print requires an even interior page count. Rather than reject
        # the export, pad with one blank trailing page - the family shouldn't
        # have to add/remove a photo just to satisfy a print-vendor rule.
        needs_blank_padding = blurb_mode and total_pages % 2 == 1
        if needs_blank_padding:
            total_pages += 1

        blurb_page_count_ok = True
        blurb_spine_width_in = None
        if blurb_mode:
            blurb_page_count_ok = (
                blurb_print_spec.PAGE_COUNT_MIN <= total_pages <= blurb_print_spec.PAGE_COUNT_MAX
            )
            if blurb_page_count_ok:
                blurb_spine_width_in = blurb_print_spec.spine_width_in(
                    total_pages, blurb_cover_type, blurb_paper_type
                )

        service = get_drive_service(args.credentials, args.token, args.no_browser)
        folder_id, folder_url = create_job_chunks_folder(service, args.job_id)
        # In Blurb mode the digital single-page cover is not part of the
        # interior content at all - the cover_wrap.pdf produced below is the
        # sole cover deliverable, kept as a separate file (never merged).
        total_chunks = (
            (0 if blurb_mode else 1)
            + len(months)
            + (1 if needs_blank_padding else 0)
            + (1 if blurb_mode and blurb_page_count_ok else 0)
        )
        report_status(args.callback_url, args.callback_token, args.job_id, 8,
                      f"Rendering {total_chunks} chunk(s) for {len(articles)} article(s)")

        with sync_playwright() as p:
            browser = p.chromium.launch()

            if not blurb_mode:
                cover_html = generate_cover_html(articles, job.get('date_from', ''), job.get('date_to', ''),
                                                 options, config, args.callback_url, args.callback_token)
                cover_pdf = render_html_to_pdf(browser, cover_html)
                upload_pdf(service, folder_id, "chunk_000_cover.pdf", cover_pdf)
                report_status(args.callback_url, args.callback_token, args.job_id,
                              10, f"Rendered cover (1/{total_chunks})")

            start_page = 0
            for idx, key in enumerate(months, start=1):
                month_index = int(key.split('-')[1]) - 1
                chunk_html = generate_month_chunk_html(
                    by_month[key], month_label(key), month_index,
                    start_page, total_pages, options, args.callback_url, args.callback_token,
                )
                start_page += page_counts[key]

                chunk_pdf = render_html_to_pdf(browser, chunk_html)
                upload_pdf(service, folder_id, f"chunk_{idx:03d}_{key}.pdf", chunk_pdf)
                progress = 10 + int(65 * idx / max(len(months), 1))
                report_status(args.callback_url, args.callback_token, args.job_id,
                              progress, f"Rendered {month_label(key)} ({idx + 1}/{total_chunks})")

            if needs_blank_padding:
                blank_html = f'''<!doctype html>
<html><head><meta charset="utf-8"><style>{build_page_css()}</style></head>
<body><div class="articles-page"></div></body></html>'''
                blank_pdf = render_html_to_pdf(browser, blank_html)
                upload_pdf(service, folder_id, f"chunk_{len(months) + 1:03d}_blank.pdf", blank_pdf)
                report_status(args.callback_url, args.callback_token, args.job_id,
                              78, "Rendered blank padding page (even page count for Blurb)")

            if blurb_mode:
                if blurb_page_count_ok:
                    cover_wrap_html = generate_blurb_cover_html(
                        articles, job.get('date_from', ''), job.get('date_to', ''),
                        options, config, args.callback_url, args.callback_token,
                        format_key=blurb_format, cover_type=blurb_cover_type,
                        paper_type=blurb_paper_type, page_count=total_pages,
                    )
                    cover_wrap_pdf = render_html_to_pdf(browser, cover_wrap_html)
                    upload_pdf(service, folder_id, "cover_wrap.pdf", cover_wrap_pdf)
                    report_status(args.callback_url, args.callback_token, args.job_id,
                                  85, f"Rendered Blurb cover-wrap (spine {blurb_spine_width_in:.3f}in)")
                else:
                    report_status(
                        args.callback_url, args.callback_token, args.job_id, 85,
                        f"Skipped Blurb cover-wrap: page count {total_pages} is outside "
                        f"the supported {blurb_print_spec.PAGE_COUNT_MIN}-{blurb_print_spec.PAGE_COUNT_MAX} range"
                    )

            browser.close()

        report_complete(args.callback_url, args.callback_token, args.job_id, folder_id, folder_url)
        print(json.dumps({"chunks_folder_id": folder_id, "chunks_folder_url": folder_url}))
    except SystemExit as exc:
        report_failed(args.callback_url, args.callback_token, args.job_id, str(exc))
        raise
    except Exception as exc:  # noqa: BLE001 - report any failure back to the Worker
        report_failed(args.callback_url, args.callback_token, args.job_id, str(exc))
        raise


if __name__ == "__main__":
    main()
