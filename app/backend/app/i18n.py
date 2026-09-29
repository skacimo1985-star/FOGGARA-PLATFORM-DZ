"""تحميل مفاتيح الرسائل ثلاثية اللغات من messages_i18n.json.

الـAPI يعيد دائمًا `detail.code`؛ هذه الوحدة توفّر النص المترجم عند الحاجة
(مثل رسائل الـhealth أو للاختبارات) دون تكرار النصوص في الكود.
"""
import json
import pathlib

_PATH = pathlib.Path(__file__).resolve().parent / "messages_i18n.json"
_CACHE: dict | None = None


def messages() -> dict:
    global _CACHE
    if _CACHE is None:
        _CACHE = json.loads(_PATH.read_text(encoding="utf-8"))
    return _CACHE


def get_message(code: str, locale: str = "ar") -> str:
    entry = messages().get(code)
    if not isinstance(entry, dict):
        return code
    return entry.get(locale) or entry.get("en") or code
