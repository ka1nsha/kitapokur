"""Kitaptaki kelimeleri çıkarır, köklerine indirger ve sayfalara bağlar.

Her sayfa için metin cümlelere bölünür, kelimeler simplemma ile köke
indirgenir (running → run) ve wordfreq'ten İngilizcedeki sıklıkları alınır.
Okuyucu paneli, kullanıcının seviyesine göre seyrek olanları gösterir.
"""

import logging
import re
import time
import unicodedata
from collections import defaultdict
from functools import lru_cache

import pymupdf
import simplemma
from wordfreq import zipf_frequency

from .db import get_conn, transaction

log = logging.getLogger("kitapokur.words")

# Seviye → bu sıklığın üstündeki kelimeler bilindiği varsayılıp gizlenir.
# Yaklaşık değerler: A2 ≈ en yaygın 1.100, B1 ≈ 3.000, B2 ≈ 7.200, C1 ≈ 15.000 kelime.
LEVELS = {"A2": 5.0, "B1": 4.5, "B2": 4.0, "C1": 3.5}
DEFAULT_LEVEL = "B1"

# En düşük seviyenin eşiği; bundan yaygın kelimeler sayfa kaydına hiç girmez.
CANDIDATE_MAX_ZIPF = max(LEVELS.values())

_TOKEN = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*")
_SENTENCE_END = re.compile(r"[.!?…]+[\"”’)\]]*\s+")
_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "st", "jr", "sr", "prof", "vs", "etc", "eg", "ie",
    "mt", "no", "vol", "ch", "fig", "ft", "gen", "capt", "col", "lt", "rev", "gov",
}
_ROMAN = {
    s for s in (
        "i ii iii iv v vi vii viii ix x xi xii xiii xiv xv xvi xvii xviii xix xx "
        "xxi xxii xxiii xxiv xxv xxvi xxvii xxviii xxix xxx xxxi xxxii xxxiii "
        "xxxiv xxxv xxxvi xxxvii xxxviii xxxix xl xli xlii xliii xliv xlv xlvi "
        "xlvii xlviii xlix l"
    ).split()
}
# Ekranda gösterilen cümle için üst sınır (çok uzun "cümleler" genelde tablo/dizindir).
_MAX_SENTENCE = 700
_PREFERRED_SENTENCE = 260

# Bitişik harfleri (ﬁ, ﬂ) açar, satır sonundaki tirelemeleri birleştirir.
_TEXT_FLAGS = pymupdf.TEXT_DEHYPHENATE | pymupdf.TEXT_MEDIABOX_CLIP


# simplemma'nın bilinen yanlış kökleri.
_LEMMA_OVERRIDES = {"gone": "go"}
# Bulunan kök kelimenin kendisinden bu kadar seyrekse şüpheli sayılır
# (ör. fixed → "fixe", thinking → "thinke").
_SUSPECT_GAP = 1.5


def _stem_candidates(w: str) -> list[str]:
    """Basit çekim kuralları; yalnızca kök bulucu şüpheli sonuç verdiğinde denenir."""
    out = []
    if w.endswith("ing") and len(w) > 5:
        b = w[:-3]
        out += [b, b + "e"] + ([b[:-1]] if len(b) > 2 and b[-1] == b[-2] else [])
    elif w.endswith("ied") and len(w) > 4:
        out += [w[:-3] + "y"]
    elif w.endswith("ed") and len(w) > 4:
        b = w[:-2]
        # "united" → "unit" olmasın: "-e"li biçim gerçek bir kelimeyse kökü kelimenin kendisi bırak.
        if zipf_of(w[:-1]) < 3.0:
            out += [b] + ([b[:-1]] if len(b) > 2 and b[-1] == b[-2] else [])
    elif w.endswith("ies") and len(w) > 4:
        out += [w[:-3] + "y"]
    elif w.endswith("ves") and len(w) > 4:
        out += [w[:-3] + "fe", w[:-3] + "f"]
    elif w.endswith("es") and len(w) > 4:
        out += [w[:-2], w[:-1]]
    elif w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        out += [w[:-1]]
    return out


@lru_cache(maxsize=200_000)
def lemma_of(word: str) -> str:
    if word in _LEMMA_OVERRIDES:
        return _LEMMA_OVERRIDES[word]
    lemma = simplemma.lemmatize(word, lang="en").lower()
    if not lemma.isalpha():
        return word
    floor = zipf_of(word) - _SUSPECT_GAP
    if lemma == word or zipf_of(lemma) >= floor:
        return lemma
    for alt in _stem_candidates(word):
        if zipf_of(alt) >= floor:
            return alt
    return word


@lru_cache(maxsize=200_000)
def zipf_of(word: str) -> float:
    return zipf_frequency(word, "en")


def normalize_token(token: str) -> str:
    """"don't" → "do", "teacher's" → "teacher"."""
    return re.split(r"['’]", token, maxsplit=1)[0].lower()


def is_candidate(lemma: str, zipf: float) -> bool:
    return len(lemma) >= 3 and 0 < zipf < CANDIDATE_MAX_ZIPF and lemma not in _ROMAN


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    sentences, start = [], 0
    for m in _SENTENCE_END.finditer(text):
        end = m.end()
        nxt = text[end:end + 1]
        if not nxt or not (nxt.isupper() or nxt.isdigit() or nxt in "\"“‘([—"):
            continue
        prev = re.search(r"([A-Za-z]+)[.]+$", text[start:m.start() + 1])
        if prev and (prev.group(1).lower() in _ABBREVIATIONS or len(prev.group(1)) == 1):
            continue
        sentences.append(text[start:end].strip())
        start = end
    if start < len(text):
        sentences.append(text[start:].strip())
    return [s for s in sentences if s]


def page_text(page: pymupdf.Page) -> str:
    text = page.get_text("text", flags=_TEXT_FLAGS)
    return unicodedata.normalize("NFKC", text)


def page_word_boxes(page: pymupdf.Page) -> list[tuple[str, float, float, float, float]]:
    """Sayfadaki her kelimenin kutusu, sayfa boyutuna oranla (0–1).

    Tarayıcıdaki metin katmanı iki yana yaslı satırlarda kelime konumlarını
    kaydırabildiği için vurgular PDF'in kendi koordinatlarından çizilir.
    """
    rect = page.rect
    matrix = page.rotation_matrix
    out = []
    for x0, y0, x1, y1, text, *_ in page.get_text("words", flags=_TEXT_FLAGS):
        text = unicodedata.normalize("NFKC", text)
        r = pymupdf.Rect(x0, y0, x1, y1) * matrix
        for m in _TOKEN.finditer(text):
            token = normalize_token(m.group(0))
            if len(token) < 2:
                continue
            # Noktalama dahil kutuyu harf sayısına göre kelimenin kendisine daralt.
            n = max(len(text), 1)
            if r.width >= r.height:
                a, b = r.x0 + r.width * m.start() / n, r.x0 + r.width * m.end() / n
                box = (a, r.y0, b, r.y1)
            else:  # döndürülmüş metin
                a, b = r.y0 + r.height * m.start() / n, r.y0 + r.height * m.end() / n
                box = (r.x0, a, r.x1, b)
            out.append((
                token,
                round(box[0] / rect.width, 4), round(box[1] / rect.height, 4),
                round(box[2] / rect.width, 4), round(box[3] / rect.height, 4),
            ))
    return out


def extract(book_id: int, pdf_path) -> None:
    """Kitabın kelimelerini çıkarıp veritabanına yazar."""
    conn = get_conn()
    _set_status(book_id, "processing", 0)
    started = time.monotonic()

    counts: dict[str, int] = defaultdict(int)
    first_page: dict[str, int] = {}
    lower_seen: set[str] = set()      # en az bir kez küçük harfle geçenler
    capital_mid: set[str] = set()     # cümle ortasında büyük harfle geçenler
    sentences: list[tuple[int, str]] = []
    # (sayfa, kök) → [adet, cümle indeksi, cümle uzunluğu, yüzey biçimleri]
    page_words: dict[tuple[int, str], list] = {}
    texts: list[tuple[int, str]] = []  # kitap içinde arama için (bkz. search.py)

    with pymupdf.open(pdf_path) as doc:
        total = doc.page_count
        last_report = 0.0
        for pno in range(total):
            page_no = pno + 1
            text = page_text(doc[pno])
            texts.append((page_no, " ".join(text.split())))
            for sentence in split_sentences(text):
                if len(sentence) > _MAX_SENTENCE:
                    sentence = sentence[:_MAX_SENTENCE].rsplit(" ", 1)[0] + " …"
                s_index = len(sentences)
                sentences.append((page_no, sentence))
                for t_index, m in enumerate(_TOKEN.finditer(sentence)):
                    raw = m.group(0)
                    word = normalize_token(raw)
                    if len(word) < 2:
                        continue
                    lemma = lemma_of(word)
                    counts[lemma] += 1
                    first_page.setdefault(lemma, page_no)

                    head = raw[0]
                    if head.islower():
                        lower_seen.add(lemma)
                    elif t_index > 0 and not raw.isupper():
                        capital_mid.add(lemma)

                    if not is_candidate(lemma, zipf_of(lemma)):
                        continue
                    if raw.isupper() and word in _ROMAN:
                        continue
                    key = (page_no, lemma)
                    entry = page_words.get(key)
                    if entry is None:
                        page_words[key] = [1, s_index, len(sentence), {word}]
                    else:
                        entry[0] += 1
                        entry[3].add(word)
                        # İlk cümle çok uzunsa daha okunaklı bir örnek seç.
                        if entry[2] > _PREFERRED_SENTENCE and len(sentence) < entry[2]:
                            entry[1], entry[2] = s_index, len(sentence)

            progress = page_no / total
            if progress - last_report >= 0.05:
                last_report = progress
                _set_status(book_id, "processing", progress * 0.9)

    proper = {lemma for lemma in capital_mid if lemma not in lower_seen}
    _store(book_id, counts, first_page, proper, sentences, page_words, texts)
    _set_status(book_id, "ready", 1)
    log.info(
        "Kitap %s: %d kelime, %d aday, %.1f sn",
        book_id, len(counts), len({k[1] for k in page_words}), time.monotonic() - started,
    )
    conn.execute("PRAGMA optimize")


def _set_status(book_id: int, status: str, progress: float) -> None:
    with transaction() as tx:
        tx.execute(
            "UPDATE books SET words_status = ?, words_progress = ? WHERE id = ?",
            (status, round(progress, 3), book_id),
        )


def _store(book_id, counts, first_page, proper, sentences, page_words, texts) -> None:
    lemmas = list(counts)
    with transaction() as tx:
        if tx.execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
            return  # işlenirken silinmiş
        tx.execute("DELETE FROM page_words WHERE book_id = ?", (book_id,))
        tx.execute("DELETE FROM sentences WHERE book_id = ?", (book_id,))
        tx.execute("DELETE FROM book_words WHERE book_id = ?", (book_id,))
        tx.execute("DELETE FROM page_texts WHERE book_id = ?", (book_id,))
        tx.executemany(
            "INSERT INTO page_texts (book_id, page, text) VALUES (?, ?, ?)",
            ((book_id, page, text) for page, text in texts if text),
        )

        tx.executemany(
            "INSERT OR IGNORE INTO words (lemma, zipf) VALUES (?, ?)",
            ((lemma, zipf_of(lemma)) for lemma in lemmas),
        )
        ids: dict[str, int] = {}
        for i in range(0, len(lemmas), 500):
            chunk = lemmas[i:i + 500]
            marks = ",".join("?" * len(chunk))
            for row in tx.execute(f"SELECT id, lemma FROM words WHERE lemma IN ({marks})", chunk):
                ids[row["lemma"]] = row["id"]

        tx.executemany(
            "INSERT INTO book_words (book_id, word_id, count, first_page, is_proper) VALUES (?, ?, ?, ?, ?)",
            # Roma rakamları da (bölüm numaraları) özel ad gibi listelerin dışında tutulur.
            ((book_id, ids[l], c, first_page[l], int(l in proper or l in _ROMAN)) for l, c in counts.items()),
        )

        # Yalnızca bir aday kelimeye örnek olan cümleler saklanır.
        used = sorted({entry[1] for entry in page_words.values()})
        sentence_ids: dict[int, int] = {}
        for s_index in used:
            page, text = sentences[s_index]
            cur = tx.execute(
                "INSERT INTO sentences (book_id, page, text) VALUES (?, ?, ?)", (book_id, page, text)
            )
            sentence_ids[s_index] = cur.lastrowid

        tx.executemany(
            """
            INSERT INTO page_words (book_id, page, word_id, count, sentence_id, surfaces)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                (book_id, page, ids[lemma], e[0], sentence_ids[e[1]], ",".join(sorted(e[3])))
                for (page, lemma), e in page_words.items()
            ),
        )
