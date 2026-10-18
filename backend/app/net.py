"""Dış servislere yapılan küçük HTTP istekleri (yalnızca standart kütüphane)."""

import json
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "KitapOkur/0.3 (kisisel PDF okuyucu; Raspberry Pi)"


class NetError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def request(url: str, *, params=None, data: dict | None = None, timeout: float = 8.0, headers=None) -> bytes:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params, doseq=True)}"
    body = urllib.parse.urlencode(data, doseq=True).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        raise NetError(f"HTTP {exc.code}: {url[:120]}", exc.code) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise NetError(f"Bağlantı hatası: {exc}") from exc


def get_json(url: str, **kwargs):
    return json.loads(request(url, **kwargs))
