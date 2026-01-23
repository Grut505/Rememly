#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Télécharge les pictos fruits & légumes "de saison" depuis les pages Biocoop
(mois de janvier à décembre), dans des dossiers:
  ./images/01, ./images/02, ... ./images/12

Exigences :
- patate douce et clémentine doivent être conservées (donc retirées des exotiques).
- les images doivent être écrasées à chaque exécution :
    - suppression complète de ./images au début (par défaut)
    - ou bien écrasement fichier par fichier

URLs :
- Attention: la forme varie selon le mois (ex. avril: "de-avril", pas "d-avril").
  Le mapping ci-dessous encode chaque URL correctement.

Extraction :
- div.items-wrapper > div.item-content
  - nom: h3
  - image: img src / data-lazy-src / data-src (lazyload supporté)

Fallback :
- si "items-wrapper" n'apparaît pas dans le HTML récupéré par requests,
  rendu navigateur via Playwright (optionnel).
"""

import os
import re
import sys
import time
import shutil
import hashlib
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

# Optionnel: Playwright (fallback si la page est rendue en JS)
USE_PLAYWRIGHT_FALLBACK = True
try:
    from playwright.sync_api import sync_playwright  # type: ignore
except Exception:
    sync_playwright = None
    USE_PLAYWRIGHT_FALLBACK = False

BASE = "https://www.biocoop.fr"

# Mapping exact des slugs URL par mois
MONTH_URL_SLUG = {
    "01": "de-janvier",
    "02": "de-fevrier",
    "03": "de-mars",
    "04": "de-avril",     # <-- correction: avril = de-avril
    "05": "de-mai",
    "06": "de-juin",
    "07": "de-juillet",
    "08": "d-aout",
    "09": "de-septembre",
    "10": "d-octobre",
    "11": "de-novembre",
    "12": "de-decembre",
}

def month_url(mm: str) -> str:
    slug = MONTH_URL_SLUG[mm]
    return f"{BASE}/fruits-legumes-le-calendrier-de-saisonnalite-{slug}-selon-biocoop"

# Liste d’exclusion “exotiques” (à adapter).
# IMPORTANT: patate douce et clémentine DOIVENT rester => retirées de cette liste.
EXOTIC_KEYWORDS = {
    "avocat", "ananas", "banane", "citron", "citron vert", "lime", "kiwi",
    "mangue", "papaye", "fruit de la passion", "grenadille", "litchi", "goyave",
    "coco", "noix de coco", "kumquat", "pamplemousse", "pomelo",
    "orange", "mandarine",
    "datte",
    "gingembre",
}

def slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[’'`]", "", s)
    s = re.sub(r"[^a-z0-9àâäéèêëîïôöùûüç -]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.replace(" ", "_")

def is_exotic(name: str) -> bool:
    n = name.strip().lower()
    return any(kw in n for kw in EXOTIC_KEYWORDS)

def safe_ext_from_url(u: str) -> str:
    p = urlparse(u).path
    _, ext = os.path.splitext(p)
    ext = ext.lower()
    return ext if ext in {".jpg", ".jpeg", ".png", ".webp"} else ".png"

def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)

def fetch_html_requests(session: requests.Session, url: str) -> str:
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r.text

def fetch_html_playwright(url: str) -> str:
    if not sync_playwright:
        raise RuntimeError("Playwright indisponible. Installez-le ou désactivez le fallback.")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1000)
        html = page.content()
        browser.close()
        return html

def fetch_html(session: requests.Session, url: str) -> str:
    html = fetch_html_requests(session, url)

    # Si la structure attendue n'apparaît pas, fallback Playwright
    if "items-wrapper" not in html and USE_PLAYWRIGHT_FALLBACK:
        html = fetch_html_playwright(url)

    return html

def extract_items(html: str, page_url: str):
    soup = BeautifulSoup(html, "html.parser")
    items = []

    def pick_img_src(img):
        src = img.get("data-lazy-src") or img.get("data-src") or img.get("src") or ""
        # placeholder lazyload
        if src.startswith("data:image") and img.get("data-lazy-src"):
            src = img.get("data-lazy-src")
        return src

    for item in soup.select("div.items-wrapper div.item-content"):
        h3 = item.select_one("div.content h3, h3")
        if not h3:
            continue
        name = h3.get_text(strip=True)
        if not name:
            continue

        img = item.select_one("div.image-wrapper img, img")
        if not img:
            continue

        src = pick_img_src(img)
        if not src:
            continue

        img_url = urljoin(page_url, src)
        items.append((name, img_url))

    # Dédoublonnage
    dedup, seen = [], set()
    for name, img_url in items:
        key = (name.lower(), img_url)
        if key not in seen:
            seen.add(key)
            dedup.append((name, img_url))
    return dedup

def download(session: requests.Session, url: str, dest_path: str) -> None:
    # écrasement garanti car on ouvre dest_path en "wb"
    with session.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 64):
                if chunk:
                    f.write(chunk)

def reset_output_dir(out_root: str) -> None:
    # suppression complète au début
    if os.path.isdir(out_root):
        shutil.rmtree(out_root)
    os.makedirs(out_root, exist_ok=True)

def main(out_root="images", sleep_s=0.3, debug_html=False, wipe_first=True):
    if wipe_first:
        reset_output_dir(out_root)
    else:
        ensure_dir(out_root)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; SeasonalityImageFetcher/1.0)"
    })

    total_saved = 0

    for mm in MONTH_URL_SLUG.keys():
        url = month_url(mm)
        print(f"\n== {mm} -> {url}")
        month_dir = os.path.join(out_root, mm)
        ensure_dir(month_dir)

        html = fetch_html(session, url)

        if debug_html:
            dbg = os.path.join(out_root, f"debug_{mm}.html")
            with open(dbg, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"  debug écrit: {dbg}")
            print(f"  items-wrapper présent ? {'items-wrapper' in html}")

        items = extract_items(html, url)

        if not items:
            print("  !! Aucun item trouvé (structure HTML possiblement différente).")
            continue

        saved = 0
        skipped_exotic = 0

        for name, img_url in items:
            if is_exotic(name):
                skipped_exotic += 1
                continue

            ext = safe_ext_from_url(img_url)
            h8 = hashlib.sha1(img_url.encode("utf-8")).hexdigest()[:8]
            filename = f"{slugify(name)}_{h8}{ext}"
            dest = os.path.join(month_dir, filename)

            try:
                download(session, img_url, dest)
                saved += 1
                total_saved += 1
                print(f"  + {name} -> {dest}")
            except Exception as e:
                print(f"  !! échec {name} ({img_url}) : {e}")

            time.sleep(sleep_s)

        print(f"  => sauvegardées: {saved} | exotiques ignorés: {skipped_exotic} | items détectés: {len(items)}")

    print(f"\nTerminé. Total images sauvegardées: {total_saved}")
    return 0

if __name__ == "__main__":
    # Options:
    #   --debug  : écrit des debug_MM.html
    #   --no-wipe: ne supprime pas ./images au début
    debug = "--debug" in sys.argv
    no_wipe = "--no-wipe" in sys.argv
    sys.exit(main(out_root="images", debug_html=debug, wipe_first=(not no_wipe)))
