"""İngilizce tanım, telaffuz (IPA) ve ses kaydı.

Önce Free Dictionary API denenir; yanıt vermezse (sık sık kapalı olabiliyor)
bir süre atlanır ve Wiktionary kullanılır.
"""

import html
import logging
import re
import threading
import time
import urllib.parse

from . import net

log = logging.getLogger("kitapokur.dictionary")

_FREE_DICT = "https://api.dictionaryapi.dev/api/v2/entries/en/"
_WIKT_DEF = "https://en.wiktionary.org/api/rest_v1/page/definition/"
_WIKT_API = "https://en.wiktionary.org/w/api.php"
_COMMONS_FILE = "https://commons.wikimedia.org/wiki/Special:FilePath/"

# Bir sağlayıcı hata verdiyse bu kadar saniye hiç denenmez.
_COOLDOWN = 600
_down_until: dict[str, float] = {}
_lock = threading.Lock()

MAX_POS = 4
MAX_DEFS = 3


def _available(name: str) -> bool:
    with _lock:
        return time.monotonic() >= _down_until.get(name, 0)


def _mark_down(name: str) -> None:
    with _lock:
        _down_until[name] = time.monotonic() + _COOLDOWN
    log.warning("%s yanıt vermiyor, %d sn boyunca atlanacak", name, _COOLDOWN)


def _clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def lookup(word: str) -> dict:
    """{"phonetic", "audio", "meanings": [{"pos", "defs": [{"en", "example"}]}], "source"}"""
    if _available("freedictionary"):
        try:
            result = _free_dictionary(word)
            if result is not None:
                return result
        except net.NetError as exc:
            if exc.status != 404:
                _mark_down("freedictionary")
    if _available("wiktionary"):
        try:
            return _wiktionary(word)
        except net.NetError as exc:
            if exc.status != 404:
                _mark_down("wiktionary")
    return {"phonetic": None, "audio": None, "meanings": [], "source": None}


def _free_dictionary(word: str) -> dict | None:
    data = net.get_json(_FREE_DICT + urllib.parse.quote(word), timeout=1.5)
    if not isinstance(data, list) or not data:
        return None
    phonetic, audio, meanings = None, None, {}
    for entry in data:
        phonetic = phonetic or entry.get("phonetic")
        for ph in entry.get("phonetics", []):
            phonetic = phonetic or ph.get("text")
            # Amerikan telaffuzunu tercih et.
            if ph.get("audio") and (audio is None or "-us" in ph["audio"]):
                audio = ph["audio"]
        for m in entry.get("meanings", []):
            pos = m.get("partOfSpeech", "").lower()
            defs = meanings.setdefault(pos, [])
            for d in m.get("definitions", []):
                if len(defs) < MAX_DEFS and d.get("definition"):
                    defs.append({"en": d["definition"], "example": d.get("example")})
    return {
        "phonetic": phonetic,
        "audio": audio,
        "meanings": [{"pos": p, "defs": d} for p, d in list(meanings.items())[:MAX_POS] if d],
        "source": "Free Dictionary",
    }


def _wiktionary(word: str) -> dict:
    data = net.get_json(_WIKT_DEF + urllib.parse.quote(word), timeout=6)
    meanings = []
    for block in data.get("en", [])[:MAX_POS]:
        defs = []
        for d in block.get("definitions", []):
            text = _clean(d.get("definition", ""))
            if not text:
                continue
            examples = [_clean(e) for e in d.get("examples", []) if e]
            defs.append({"en": text, "example": examples[0] if examples else None})
            if len(defs) >= MAX_DEFS:
                break
        if defs:
            meanings.append({"pos": block.get("partOfSpeech", "").lower(), "defs": defs})

    phonetic, audio = None, None
    try:
        raw = net.get_json(
            _WIKT_API,
            params={"action": "parse", "page": word, "prop": "wikitext", "format": "json", "redirects": 1},
            timeout=6,
        )
        wikitext = raw.get("parse", {}).get("wikitext", {}).get("*", "")
        # Yalnızca "English" bölümü.
        m = re.search(r"^==\s*English\s*==\s*$(.*?)(?=^==[^=])", wikitext + "\n==End==", re.M | re.S)
        section = m.group(1) if m else ""
        ipa = re.search(r"\{\{IPA\|en\|(/[^/|}]+/|\[[^\]|}]+\])", section)
        phonetic = ipa.group(1) if ipa else None
        files = re.findall(r"\{\{audio\|en\|([^|}]+\.(?:ogg|mp3|wav))", section, re.I)
        if files:
            us = [f for f in files if re.search(r"(^|-)us-", f, re.I)]
            audio = _COMMONS_FILE + urllib.parse.quote((us or files)[0].strip().replace(" ", "_"))
    except net.NetError:
        pass
    return {"phonetic": phonetic, "audio": audio, "meanings": meanings, "source": "Wiktionary"}
