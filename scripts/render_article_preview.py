"""
Renders a "how would this article look in the real PDF" preview for the
article editor's Preview PDF button.

This is an HTML-only preview, not an actual PDF: it reuses
_prepare_article_media()/_render_article_html()/_render_side_by_side_column()/
_render_full_page_article_html()/build_page_groups()/build_page_css() from
render_pdf_chunks.py to build just the single page (interior spread) the
target article would land on, with the exact same pagination rules (month
grouping, 2-per-page pairing, side-by-side portrait pairs, solo full_page
pages, recto-alignment blank pages) used to find that page - nothing about
the real export path is touched or duplicated. Skipping the Playwright/
Chromium PDF-rendering step entirely means no browser install is needed in
the GitHub Actions runner (see pdf-article-preview.yml), so a preview comes
back in a fraction of the time a real PDF chunk render would take - and the
frontend can show the page HTML directly in an iframe instead of needing to
open a downloaded PDF file.

The target article may be brand new or an unsaved Draft (real generation
would never include either), so the editor sends its current in-progress
content directly instead of requiring it to already exist as an ACTIVE row -
see pdf/article-preview-data, which returns it separately from the other
real ACTIVE articles in range and lets this script splice it into the
month it belongs to before computing pagination, exactly as if a real
export had included it.

There's no real PDF "job" behind a standalone article preview, so per-job
choices (normally picked in the Generate PDF modal) aren't available here -
instead this mirrors them from the same global Settings config values the
modal itself defaults from (blurb mode/format/cover/paper, mirror-odd-pages),
so the preview matches what generating "right now" with current settings
would actually produce.
"""

import argparse
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

sys.path.insert(0, __file__.rsplit('/', 1)[0])

import blurb_print_spec  # noqa: E402
from render_pdf_chunks import (  # noqa: E402
    API_HEADERS,
    PAGE_MARGIN_CM,
    _compute_divider_blank_pages,
    _prepare_article_media,
    _render_article_html,
    _render_full_page_article_html,
    _render_side_by_side_column,
    build_page_css,
    build_page_groups,
    set_article_border_style,
    set_page_dimensions,
)

TARGET_MARKER = '_is_target'


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


def fetch_preview_data(callback_url: str, token: str, preview_id: str):
    data = api_call(callback_url, "pdf/article-preview-data", {"token": token, "preview_id": preview_id})
    return data.get("target_article", {}), data.get("articles", []), data.get("config", {})


def report_complete(callback_url: str, token: str, preview_id: str, html: str, target_page: int):
    b64 = base64.b64encode(html.encode("utf-8")).decode("ascii")
    qs = urllib.parse.urlencode({"path": "pdf/preview-complete", "token": token})
    url = f"{callback_url}?{qs}"
    body = json.dumps({
        "preview_id": preview_id,
        "base64": b64,
        "mime_type": "text/html",
        "meta": {"target_page": target_page},
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST", headers={**API_HEADERS, "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("ok"):
        raise SystemExit(f"pdf/preview-complete failed: {payload}")


def main():
    parser = argparse.ArgumentParser(description="Render a single article's real-PDF-position preview.")
    parser.add_argument("--preview-id", required=True)
    parser.add_argument("--callback-url", required=True)
    parser.add_argument("--callback-token", required=True)
    args = parser.parse_args()

    target_article, articles, config = fetch_preview_data(args.callback_url, args.callback_token, args.preview_id)
    if not target_article.get('date'):
        raise SystemExit("Preview data is missing the target article's date")

    try:
        border_width_px = float(config.get('pdf_article_border_width_px') or 1)
    except (TypeError, ValueError):
        border_width_px = 1
    border_color = config.get('pdf_article_border_color') or '#cccccc'
    set_article_border_style(border_width_px, border_color)

    blurb_mode = str(config.get('blurb_mode_enabled') or '').lower() == 'true'
    blurb_format = config.get('blurb_format') or 'magazine_premium'
    blurb_cover_type = config.get('blurb_cover_type') or 'softcover'
    if blurb_mode:
        trim_w_in, trim_h_in = blurb_print_spec.TRIM_SIZES_IN[blurb_format]
        content_w_cm = blurb_print_spec.inch_to_cm(trim_w_in) - 2 * PAGE_MARGIN_CM
        content_h_cm = blurb_print_spec.inch_to_cm(trim_h_in) - 2 * PAGE_MARGIN_CM
        guts_bleed_cm = blurb_print_spec.inch_to_cm(blurb_print_spec.BLEED_IN[blurb_cover_type])
        set_page_dimensions(content_w_cm, content_h_cm, bleed_cm=guts_bleed_cm, blurb_mode=True)

    options = {
        'blurb_mirror_odd_pages': str(config.get('blurb_mirror_odd_pages') or '').lower() == 'true',
    }

    target_article = dict(target_article)
    target_article[TARGET_MARKER] = True
    all_articles = articles + [target_article]
    all_articles.sort(key=lambda a: a.get('date') or '')

    by_month = defaultdict(list)
    for article in all_articles:
        key = (article.get('date') or '')[:7] or 'unknown'
        by_month[key].append(article)
    months = sorted(by_month.keys())

    page_counts = {key: 1 + len(build_page_groups(by_month[key])) for key in months}
    divider_blank_pages = _compute_divider_blank_pages(months, page_counts)

    target_month_key = (target_article.get('date') or '')[:7] or 'unknown'

    start_page = 0
    for key in months:
        if divider_blank_pages.get(key):
            start_page += 1
        if key == target_month_key:
            break
        start_page += page_counts[key]

    month_articles = by_month[target_month_key]
    groups = build_page_groups(month_articles)
    group_index = next(
        i for i, group in enumerate(groups) if any(a.get(TARGET_MARKER) for a in group)
    )
    group = groups[group_index]

    # Which absolute page the target ended up on - same divider(+1) + group
    # index math as real generation, just for display ("this article would
    # land on page N") since there's no multi-page PDF to jump around in
    # anymore.
    target_page = start_page + 1 + group_index + 1

    mirror_odd_pages = bool(options.get('blurb_mirror_odd_pages'))
    mirrored = mirror_odd_pages and target_page % 2 == 1

    if len(group) == 1 and group[0].get('full_page'):
        media = _prepare_article_media(group[0], args.callback_url, args.callback_token)
        page_html = '\n  <div class="articles-page">\n'
        page_html += _render_full_page_article_html(media)
    else:
        media_a = _prepare_article_media(group[0], args.callback_url, args.callback_token)
        media_b = (
            _prepare_article_media(group[1], args.callback_url, args.callback_token)
            if len(group) > 1 else None
        )
        both_portrait = media_a['is_portrait'] and media_b is not None and media_b['is_portrait']

        if both_portrait:
            page_html = '\n  <div class="articles-page side-by-side">\n    <div class="side-by-side-row">\n'
            page_html += _render_side_by_side_column(media_a)
            page_html += _render_side_by_side_column(media_b)
            page_html += '\n    </div>\n'
        else:
            page_html = '\n  <div class="articles-page">\n'
            page_html += _render_article_html(media_a, mirrored=mirrored)
            if media_b:
                page_html += _render_article_html(media_b, mirrored=mirrored)
    page_html += f'\n    <div class="page-number">{target_page}</div>\n  </div>\n'

    html = f'''<!doctype html>
<html>
<head><meta charset="utf-8"><style>{build_page_css()}</style></head>
<body>
{page_html}
</body>
</html>'''

    report_complete(args.callback_url, args.callback_token, args.preview_id, html, target_page)
    print(json.dumps({"preview_id": args.preview_id, "bytes": len(html.encode('utf-8')), "target_page": target_page}))


if __name__ == "__main__":
    main()
