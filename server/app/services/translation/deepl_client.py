import asyncio

import deepl

# DeepL requires regional variants for some target languages
_TARGET_LANG_MAP = {
    "EN": "EN-US",
    "PT": "PT-BR",
    "ZH": "ZH-HANS",
}


def _target_lang(code: str) -> str:
    code = code.upper()
    return _TARGET_LANG_MAP.get(code, code)


class DeepLTranslationService:
    def __init__(self, api_key: str) -> None:
        self._translator = deepl.Translator(api_key)

    async def translate(
        self,
        text: str,
        target_lang: str,
        source_lang: str | None = None,
    ) -> str | None:
        tgt = _target_lang(target_lang)
        src = source_lang.upper() if source_lang else None

        try:
            result = await asyncio.to_thread(
                self._translator.translate_text,
                text,
                target_lang=tgt,
                source_lang=src,  # None = DeepL auto-detects source language
            )
            return result.text
        except Exception as e:
            print(f"[deepl] error: {e}")
            return None
