"""Çeviri sağlayıcıları.

Varsayılan olarak Google'ın anahtar gerektirmeyen web uç noktası kullanılır.
Resmî Cloud Translation API'ye geçmek için:

    KITAPOKUR_TRANSLATOR=google-cloud KITAPOKUR_GOOGLE_API_KEY=... ./run.sh
"""

import logging
import os
import threading
import time
from typing import Protocol

from . import net

log = logging.getLogger("kitapokur.translate")

# Google bir istekte bu kadar karakteri rahatça kabul ediyor.
_CHUNK_CHARS = 3500


class Translator(Protocol):
    name: str

    def translate_lines(self, lines: list[str]) -> list[str | None]:
        """Her satırı ayrı çevirir. Çevrilemeyen satır için None döner."""

    def dictionary(self, word: str) -> list[dict]:
        """Kelimenin türlere göre anlamları: [{"pos": "adjective", "terms": [...]}]."""


class _RateLimiter:
    """Ücretsiz uç noktayı yormamak için istekler arasında en az `interval` saniye."""

    def __init__(self, interval: float):
        self.interval = interval
        self._lock = threading.Lock()
        self._last = 0.0

    def wait(self) -> None:
        with self._lock:
            delay = self._last + self.interval - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            self._last = time.monotonic()


def _chunks(lines: list[str]) -> list[list[int]]:
    """Satır indekslerini karakter sınırını aşmayacak gruplara böl."""
    groups, current, size = [], [], 0
    for i, line in enumerate(lines):
        if current and size + len(line) + 1 > _CHUNK_CHARS:
            groups.append(current)
            current, size = [], 0
        current.append(i)
        size += len(line) + 1
    if current:
        groups.append(current)
    return groups


class GoogleWebTranslator:
    """translate.googleapis.com'un anahtarsız (gtx) uç noktası.

    Resmî değildir; Google değiştirirse bozulabilir. Bu yüzden her şey
    veritabanında önbelleğe alınır ve sağlayıcı tek bir ayarla değiştirilebilir.
    """

    name = "google-web"
    URL = "https://translate.googleapis.com/translate_a/single"

    def __init__(self, source: str = "en", target: str = "tr"):
        self.source, self.target = source, target
        self._limiter = _RateLimiter(0.6)

    def _call(self, text: str, extra_dt: tuple[str, ...] = ()) -> list:
        self._limiter.wait()
        params = [("client", "gtx"), ("sl", self.source), ("tl", self.target), ("dt", "t")]
        params += [("dt", d) for d in extra_dt]
        # Uzun metinler POST ile gönderilir (URL uzunluk sınırı).
        if len(text) > 1500:
            return net.get_json(self.URL, params=params, data={"q": text}, timeout=15)
        return net.get_json(self.URL, params=params + [("q", text)], timeout=10)

    def translate_lines(self, lines: list[str]) -> list[str | None]:
        out: list[str | None] = [None] * len(lines)
        for group in _chunks(lines):
            text = "\n".join(lines[i] for i in group)
            data = self._call(text)
            translated = "".join(seg[0] for seg in (data[0] or []) if seg and seg[0])
            parts = translated.split("\n")
            if len(parts) == len(group):
                for i, part in zip(group, parts):
                    out[i] = part.strip() or None
            else:
                # Google satırları birleştirdiyse bu grubu tek tek çevir.
                log.warning("Satır sayısı uyuşmadı (%d ≠ %d), tek tek çevriliyor", len(parts), len(group))
                for i in group:
                    seg = self._call(lines[i])
                    out[i] = "".join(s[0] for s in (seg[0] or []) if s and s[0]).strip() or None
        return out

    def dictionary(self, word: str) -> list[dict]:
        data = self._call(word, ("bd",))
        meanings = []
        for entry in (data[1] if len(data) > 1 and data[1] else []):
            pos, terms = entry[0], entry[1]
            if pos and terms:
                meanings.append({"pos": pos, "terms": terms[:6]})
        return meanings


class GoogleCloudTranslator:
    """Resmî Cloud Translation API (v2). Ayda 500.000 karakter ücretsiz."""

    name = "google-cloud"
    URL = "https://translation.googleapis.com/language/translate/v2"

    def __init__(self, api_key: str, source: str = "en", target: str = "tr"):
        self.api_key, self.source, self.target = api_key, source, target

    def translate_lines(self, lines: list[str]) -> list[str | None]:
        out: list[str | None] = []
        for i in range(0, len(lines), 100):
            batch = lines[i:i + 100]
            data = net.get_json(
                self.URL,
                params={"key": self.api_key},
                data={"q": batch, "source": self.source, "target": self.target, "format": "text"},
                timeout=15,
            )
            out += [t.get("translatedText") or None for t in data["data"]["translations"]]
        return out

    def dictionary(self, word: str) -> list[dict]:
        return []  # resmî API sözlük anlamı vermez


_translator: Translator | None = None


def get_translator() -> Translator:
    global _translator
    if _translator is None:
        kind = os.environ.get("KITAPOKUR_TRANSLATOR", "google-web")
        if kind == "google-cloud":
            key = os.environ.get("KITAPOKUR_GOOGLE_API_KEY")
            if not key:
                raise RuntimeError("KITAPOKUR_GOOGLE_API_KEY tanımlı değil.")
            _translator = GoogleCloudTranslator(key)
        else:
            _translator = GoogleWebTranslator()
    return _translator
