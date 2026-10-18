"""Kitabın içindekiler listesi.

PDF'in kendi içindekiler tablosu (outline) varsa o kullanılır. Yoksa
(Gutenberg kopyası romanlarda çok sık) "CHAPTER IV." gibi başlıklar sayfa
metninden bulunur. Sonuç ilk istekte hesaplanır ve veritabanında saklanır.
"""

import json
import re
from pathlib import Path

import pymupdf

# Tek başına bir satır olan bölüm başlığı: "CHAPTER IV.", "Part One", "Bölüm 3".
_HEADING = re.compile(
    r"^(chapter|book|part|volume|act|bölüm|kısım|cilt)\s+"
    r"([0-9]{1,3}|[ivxlcdm]{1,8}|[a-zçğıöşü-]{3,20})\.?$",
    re.IGNORECASE,
)
_TOP_LEVEL = {"book", "part", "volume", "kısım", "cilt"}
# Bir sayfada bundan fazla başlık varsa orası basılı içindekiler sayfasıdır.
_MAX_PER_PAGE = 3
_MAX_ITEMS = 2000


def build(pdf: Path) -> dict:
    """{"source": "pdf" | "auto" | None, "items": [{"level", "title", "page", "offset"}]}"""
    with pymupdf.open(pdf) as doc:
        items = _from_outline(doc)
        if items:
            return {"source": "pdf", "items": items}
        items = _from_headings(doc)
        return {"source": "auto" if items else None, "items": items}


def _from_outline(doc) -> list[dict]:
    items = []
    for level, title, page, dest in doc.get_toc(simple=False)[:_MAX_ITEMS]:
        title = re.sub(r"\s+", " ", title or "").strip()
        if not title or page < 1 or page > doc.page_count:
            continue
        offset = 0.0
        to = dest.get("to") if isinstance(dest, dict) else None
        if to is not None:
            height = doc[page - 1].rect.height or 1
            offset = min(1.0, max(0.0, to.y / height))
        items.append({"level": level, "title": title[:200], "page": page, "offset": round(offset, 4)})
    return items


def _from_headings(doc) -> list[dict]:
    found = []
    for page in doc:
        height = page.rect.height or 1
        hits = []
        for block in page.get_text("blocks", sort=True):
            if block[6] != 0:  # resim bloğu
                continue
            lines = [l.strip() for l in block[4].splitlines() if l.strip()]
            if not lines or len(lines) > 2:
                continue
            m = _HEADING.match(lines[0])
            if not m:
                continue
            # "CHAPTER IV." → "Chapter IV" (Romen rakamı büyük kalır).
            title = lines[0].rstrip(".")
            if title.isupper():
                title = m.group(1).capitalize() + title[len(m.group(1)):]
            # Hemen altındaki kısa satır bölümün adıdır ("CHAPTER I. / The Beginning").
            if len(lines) == 2 and len(lines[1]) <= 60:
                title = f"{title}: {lines[1]}"
            hits.append({
                "kind": m.group(1).lower(),
                "title": title[:200],
                "page": page.number + 1,
                "offset": round(min(1.0, max(0.0, block[1] / height)), 4),
            })
        if len(hits) <= _MAX_PER_PAGE:
            found.extend(hits)
        if len(found) >= _MAX_ITEMS:
            break

    # Tek bir eşleşme büyük olasılıkla rastlantıdır.
    if len(found) < 2:
        return []
    two_levels = any(h["kind"] in _TOP_LEVEL for h in found) and any(h["kind"] not in _TOP_LEVEL for h in found)
    # İlk bölüm başlıksız başlıyorsa (Gutenberg kopyalarında sık) kitabın başına da gidilebilsin.
    start = [{"level": 1, "title": "Başlangıç", "page": 1, "offset": 0.0}] if found[0]["page"] > 2 else []
    return start + [
        {
            "level": 2 if two_levels and h["kind"] not in _TOP_LEVEL else 1,
            "title": h["title"],
            "page": h["page"],
            "offset": h["offset"],
        }
        for h in found
    ]


def dumps(toc: dict) -> str:
    return json.dumps(toc, ensure_ascii=False, separators=(",", ":"))
