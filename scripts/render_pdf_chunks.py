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

SCOPES = ["https://www.googleapis.com/auth/drive"]
REPO_ROOT = Path(__file__).resolve().parent.parent
SEASONAL_IMAGES_DIR = REPO_ROOT / "tools" / "images"

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


def render_multiline(value) -> str:
    text = '' if value is None else str(value)
    lines = text.replace('\r\n', '\n').split('\n')
    if len(lines) <= 1:
        return esc(text)
    return ''.join(f'<div>{esc(line)}</div>' for line in lines)


def render_svg_multiline(value, x: float, line_height_px: float) -> str:
    text = '' if value is None else str(value)
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

def fetch_image_bytes(article: dict, callback_url: str, callback_token: str) -> Optional[bytes]:
    file_id = article.get('image_file_id')
    if not file_id:
        return None
    if '/' in file_id:
        qs = urllib.parse.urlencode({'path': 'pdf/render-image', 'token': callback_token, 'file_id': file_id})
        url = f"{callback_url}?{qs}"
    else:
        url = f"https://drive.google.com/thumbnail?id={urllib.parse.quote(file_id)}&sz=w2000"
    try:
        req = urllib.request.Request(url, headers=API_HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except Exception:
        return None


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

    mosaic_width = 12 if layout == 'centered' else 19
    mosaic_height = 12 if layout == 'centered' else 27.7
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

    page_width = 19.0
    page_height = 27.7
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
                          callback_url: str, callback_token: str) -> str:
    family_name = options.get('family_name')
    title_text = f"Livre de souvenir des {esc(family_name)}" if family_name else 'Livre de Souvenirs'

    images = []
    photo_limit = max_photos or len(articles)
    for article in articles:
        if len(images) >= photo_limit:
            break
        data = fetch_image_bytes(article, callback_url, callback_token)
        if not data:
            continue
        resized = resize_image_bytes(data, COVER_MAX_DIM)
        if resized:
            b64, mime, aspect = resized
            images.append({'base64': b64, 'mimeType': mime, 'aspectRatio': aspect})

    dates_text = f"Du {format_date_fr(date_from)} au {format_date_fr(date_to)}"

    if not images:
        return f'<div class="cover"><h1>{title_text}</h1><p class="dates">{dates_text}</p></div>'

    cells = smart_mosaic_layout(images, 19, 22, 0.07)
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


def generate_cover_masked_text_html(options: dict) -> str:
    def resolve_number(key, fallback):
        raw = options.get(key)
        try:
            return float(raw) if raw is not None else fallback
        except (TypeError, ValueError):
            return fallback

    def resolve_font_family(key, fallback):
        raw = options.get(key)
        return FONT_FAMILIES.get(raw, fallback) if raw else fallback

    def resolve_font_weight(key, fallback):
        return clamp(resolve_number(key, fallback), 100, 900)

    family_mask_image_data_uri = options.get('_family_mask_image_data_uri', '')
    family_mask_enabled = bool(family_mask_image_data_uri)

    cover_title = options.get('cover_title') or 'test H1'
    cover_subtitle = options.get('cover_subtitle') or 'test H2'

    family_letter_spacing = clamp(resolve_number('cover_family_letter_spacing_em', resolve_number('cover_vertical_letter_spacing_em', 0)), -0.2, 0.2)
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
    family_mask_text = options.get('family_name') or 'Souvenirs de famille'

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
      <div style="position:absolute; left:{family_x_cm}cm; bottom:0.2cm; width:27.7cm; white-space:nowrap; transform: rotate(-90deg) scaleX({family_scale_x}) scaleY({family_scale_y}); transform-origin: left bottom;">
        {render_multiline(family_mask_text)}
      </div>
    </div>'''

    masked_family_block = ''
    if family_mask_enabled:
        masked_family_block = f'''<div style="position:absolute; left:{family_x_cm}cm; bottom:0.2cm; width:{family_mask_width_cm}cm; height:{family_mask_height_cm}cm; white-space:nowrap; transform: rotate(-90deg); transform-origin: left bottom; overflow:hidden; z-index:20;">
      {family_mask_svg}
    </div>'''

    return f'''
  <div class="cover-mask-layout" style="width: 19cm; height: 27.7cm; position: relative;">
    <svg width="19cm" height="27.7cm" viewBox="0 0 1900 2770" xmlns="http://www.w3.org/2000/svg" style="position:absolute; inset:0;">
      <rect width="100%" height="100%" fill="#ffffff" />
    </svg>
    {fallback_family_block}
    <div style="position:absolute; left:{title_x_cm}cm; top:{title_y_cm}cm; max-width:19cm; color:#000; font-family: {title_font_family}; font-weight:{title_font_weight}; font-size:{title_font_cm}cm; letter-spacing:{title_letter_spacing}em; z-index:30;">
      <span style="display:inline-block; transform: scaleX({title_scale_x}) scaleY({title_scale_y}); transform-origin: left top;">
        {render_multiline(cover_title)}
      </span>
    </div>
    <div style="position:absolute; left:{subtitle_x_cm}cm; top:{subtitle_y_cm}cm; max-width:19cm; color:#000; font-family: {subtitle_font_family}; font-weight:{subtitle_font_weight}; font-size:{subtitle_font_cm}cm; letter-spacing:{subtitle_letter_spacing}em; z-index:30;">
      <span style="display:inline-block; transform: scaleX({subtitle_scale_x}) scaleY({subtitle_scale_y}); transform-origin: left top;">
        {render_multiline(cover_subtitle)}
      </span>
    </div>
    {masked_family_block}
  </div>'''


def generate_cover_masked_mosaic(articles: list, max_photos: Optional[int], options: dict,
                                 callback_url: str, callback_token: str) -> str:
    images = []
    photo_limit = max_photos or len(articles)
    for article in articles:
        if len(images) >= photo_limit:
            break
        data = fetch_image_bytes(article, callback_url, callback_token)
        if not data:
            continue
        resized = resize_image_bytes(data, COVER_MASK_MAX_DIM)
        if resized:
            b64, mime, aspect = resized
            images.append({'base64': b64, 'mimeType': mime, 'aspectRatio': aspect})

    family_height_cm = clamp(float(options.get('cover_family_h_cm') or 3.5), 1.5, 6)
    page_width_cm = family_height_cm
    page_height_cm = 27.7
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
    return generate_cover_masked_text_html(merged_options)


def generate_cover_html(articles: list, date_from: str, date_to: str, options: dict,
                        callback_url: str, callback_token: str) -> str:
    max_photos = options.get('max_mosaic_photos')
    style = options.get('cover_style') or 'mosaic'
    if style == 'masked-title':
        cover_html = generate_cover_masked_mosaic(articles, max_photos, options, callback_url, callback_token)
    else:
        cover_html = generate_cover_mosaic(articles, date_from, date_to, max_photos, options, callback_url, callback_token)

    return f'''<!doctype html>
<html>
<head><meta charset="utf-8"><style>{PAGE_CSS}</style></head>
<body>{cover_html}</body>
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
        if not data:
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
<head><meta charset="utf-8"><style>{PAGE_CSS}</style></head>
<body>
{divider_html}
{pages_html}
</body>
</html>'''


# ---------------------------------------------------------------------------
# CSS (ported verbatim from backend/src/pdf.js getPdfStyles())
# ---------------------------------------------------------------------------

PAGE_CSS = """
@page { size: A4; margin: 1cm; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; margin: 0; padding: 0; }

.cover { page-break-after: always; text-align: center; padding-top: 8cm; }
.cover h1 { font-size: 40pt; margin-bottom: 0.9cm; font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif; letter-spacing: 0.02em; }
.cover .dates { font-size: 20pt; color: #666; font-family: "Optima", "Segoe UI", "Helvetica Neue", Arial, sans-serif; }

.cover-mosaic { height: 27.7cm; display: flex; flex-direction: column; }
.cover-title { text-align: center; padding: 0.5cm 0 0.8cm 0; flex-shrink: 0; }
.cover-title h1 { font-size: 30pt; margin: 0 0 0.35cm 0; color: #2b2b2b; font-weight: 700; font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif; letter-spacing: 0.03em; }
.cover-title .dates { font-size: 15pt; color: #555; margin: 0; font-family: "Optima", "Segoe UI", "Helvetica Neue", Arial, sans-serif; }

.mosaic-container { flex: 1; position: relative; overflow: hidden; }
.mosaic-cell { position: absolute; overflow: hidden; }
.mosaic-cell img { width: 100%; height: 100%; object-fit: cover; }

.articles-page { page-break-before: always; height: 27.7cm; display: flex; flex-direction: column; gap: 0.4cm; }
.article { flex: 1; border: 1px solid #ccc; display: flex; flex-direction: column; overflow: hidden; max-height: 13.5cm; }
.article:nth-child(2) { margin-top: 0.2cm; }
.article-content { flex: 1; display: flex; overflow: hidden; }

.article-content.landscape { flex-direction: column; align-items: stretch; }
.article-content.landscape .article-image { width: 100%; display: flex; justify-content: center; }
.article-content.landscape .article-image img { width: 100%; max-height: 9.5cm; object-fit: contain; object-position: center top; }
.article-content.landscape .article-bottom { display: flex; flex-direction: row; align-items: center; gap: 0.5cm; padding: 0.3cm; }
.article-content.landscape .article-date { flex-shrink: 0; }
.article-content.landscape .article-text { flex: 1; }

.article-content.portrait { flex-direction: row; align-items: stretch; }
.article-content.portrait .article-image { flex-shrink: 0; display: flex; align-items: stretch; margin-right: 0.4cm; }
.article-content.portrait .article-image img { height: 100%; max-width: 10cm; object-fit: contain; object-position: left top; }
.article-content.portrait .article-right { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 0.3cm; padding: 0.3cm 0.3cm 0.3cm 0; }

.article-date { font-size: 11pt; color: #3366cc; font-weight: 500; }
.article-text { font-size: 13pt; line-height: 1.4; }

.page-number { text-align: right; font-size: 10pt; color: #666; padding-top: 0.3cm; }
.articles-page .page-number { margin-top: auto; align-self: flex-end; }

.month-divider { page-break-before: always; position: relative; height: 27.7cm; overflow: hidden; }
.month-divider .page-number { position: absolute; bottom: 0; right: 0; z-index: 10; }
.month-mosaic-bg { position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0.15; }
.month-mosaic-cell { position: absolute; overflow: hidden; }
.month-mosaic-cell img { width: 100%; height: 100%; object-fit: cover; }

.month-title-container { position: absolute; top: 40%; left: 0; right: 0; text-align: center; transform: translateY(-50%); z-index: 5; }
.month-title { font-size: 42pt; font-weight: bold; color: #333; margin: 0 0 0.5cm 0; text-shadow: 2px 2px 4px rgba(255,255,255,0.8); }
.month-subtitle { font-size: 16pt; color: #666; margin: 0; }

.month-divider-centered .month-title-container-centered { position: absolute; top: 8%; left: 0; right: 0; text-align: center; z-index: 5; }

.season-decorations { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 3; }
.season-item { position: absolute; }
.season-item img { width: 100%; height: 100%; object-fit: contain; }

.month-mosaic-centered { position: absolute; top: 32%; left: 50%; transform: translateX(-50%); width: 12cm; height: 12cm; border-radius: 0.15cm; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.month-mosaic-centered .month-mosaic-cell { position: absolute; }
.month-mosaic-centered .month-mosaic-cell img { width: 100%; height: 100%; object-fit: cover; }
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
    return data["job"], data.get("articles", [])


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
        return page.pdf(print_background=True)
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

    job, articles = fetch_job(args.callback_url, args.callback_token, args.job_id)
    options = json.loads(job.get('options_json') or '{}')

    try:
        by_month = defaultdict(list)
        for article in articles:
            key = (article.get('date') or '')[:7] or 'unknown'
            by_month[key].append(article)
        months = sorted(by_month.keys())

        page_counts = {key: 1 + math.ceil(len(by_month[key]) / 2) for key in months}
        total_pages = sum(page_counts.values())

        service = get_drive_service(args.credentials, args.token, args.no_browser)
        folder_id, folder_url = create_job_chunks_folder(service, args.job_id)
        total_chunks = 1 + len(months)
        report_status(args.callback_url, args.callback_token, args.job_id, 8,
                      f"Rendering {total_chunks} chunk(s) for {len(articles)} article(s)")

        with sync_playwright() as p:
            browser = p.chromium.launch()

            cover_html = generate_cover_html(articles, job.get('date_from', ''), job.get('date_to', ''),
                                             options, args.callback_url, args.callback_token)
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
