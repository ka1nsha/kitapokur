"""Kelimelerin çekimli biçimleri: fiilde V1/V2/V3, isimde çoğul, sıfatta dereceler.

İngilizcede zamanlar yardımcı fiillerle kurulur (have gone, will go); fiilin
kendisi birkaç biçimden ibarettir. Bu biçimler lemminflect'in kendi
sözlüğünden, internetsiz üretilir. Sözlük verisi ~50 MB bellek tuttuğu için
ilk ihtiyaç anında yüklenir.
"""

import threading

_lock = threading.Lock()
_lib = None

# Sözlükten gelen tür adı → lemminflect türü
_UPOS = {"verb": "VERB", "noun": "NOUN", "adjective": "ADJ"}


def _lemminflect():
    global _lib
    with _lock:
        if _lib is None:
            import lemminflect
            _lib = lemminflect
    return _lib


def _first(tags: dict, tag: str) -> list[str]:
    return list(tags.get(tag, ()))


def _verb(lemma: str, tags: dict) -> dict | None:
    past, pp = _first(tags, "VBD"), _first(tags, "VBN") or _first(tags, "VBD")
    if not past:
        return None
    irregular = [k for k, forms in (("past", past), ("pp", pp)) if any(not f.endswith("ed") for f in forms)]
    return {
        "pos": "verb",
        "base": lemma,
        "past": past,
        "pp": pp,
        "s": _first(tags, "VBZ"),
        "ing": _first(tags, "VBG"),
        "irregular": irregular,
    }


def _noun(lemma: str, tags: dict) -> dict | None:
    plural = [f for f in _first(tags, "NNS") if f != lemma][:1]
    # Düzenli çoğul (-s) her isimde göstermeye değmez.
    if not plural or plural[0].endswith("s"):
        return None
    return {"pos": "noun", "base": lemma, "plural": plural, "irregular": ["plural"]}


def _adjective(lemma: str, tags: dict) -> dict | None:
    comp, sup = _first(tags, "JJR")[:1], _first(tags, "JJS")[:1]
    if not comp or not sup:
        return None  # "more beautiful" gibi kurallı dereceler gösterilmez
    # big → bigger, happy → happier kurallıdır; good → better değildir.
    stem = lemma[:-1]
    irregular = [
        k for k, form, suffix in (("comparative", comp[0], "er"), ("superlative", sup[0], "est"))
        if not (form.startswith(stem) and form.endswith(suffix))
    ]
    return {"pos": "adjective", "base": lemma, "comparative": comp, "superlative": sup, "irregular": irregular}


_BUILD = {"verb": _verb, "noun": _noun, "adjective": _adjective}


def of(lemma: str, pos_list: list[str]) -> list[dict]:
    """Kelimenin türlerine göre biçimleri, sözlükteki tür sırasıyla.

    `pos_list` sözlükten gelir ("verb", "noun"...). Boşsa (sözlüğe
    ulaşılamadı) lemminflect'in bildiği türler kullanılır.
    """
    if not lemma or " " in lemma or "-" in lemma:
        return []
    lib = _lemminflect()
    pos_list = [p for p in dict.fromkeys(pos_list) if p in _UPOS]
    if not pos_list:
        known = lib.getAllLemmas(lemma)
        pos_list = [p for p, upos in _UPOS.items() if lemma in known.get(upos, ())]
    out = []
    for pos in pos_list:
        tags = lib.getAllInflections(lemma, upos=_UPOS[pos])
        if tags and (entry := _BUILD[pos](lemma, tags)):
            out.append(entry)
    return out
