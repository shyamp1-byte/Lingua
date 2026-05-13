import json

from openai import AsyncOpenAI

_LANG_NAMES: dict[str, str] = {
    "ar": "Arabic", "bg": "Bulgarian", "zh": "Chinese (Simplified)",
    "zh-hant": "Chinese (Traditional)", "cs": "Czech", "da": "Danish",
    "nl": "Dutch", "en-us": "English", "en-gb": "English", "et": "Estonian",
    "fi": "Finnish", "fr": "French", "de": "German", "el": "Greek",
    "hu": "Hungarian", "id": "Indonesian", "it": "Italian", "ja": "Japanese",
    "ko": "Korean", "lv": "Latvian", "lt": "Lithuanian", "nb": "Norwegian",
    "pl": "Polish", "pt-br": "Portuguese (Brazilian)", "pt-pt": "Portuguese (European)",
    "ro": "Romanian", "ru": "Russian", "sk": "Slovak", "sl": "Slovenian",
    "es": "Spanish", "sv": "Swedish", "tr": "Turkish", "uk": "Ukrainian",
}


async def summarize(transcript: str, api_key: str, target_language: str = "en") -> dict:
    client = AsyncOpenAI(api_key=api_key)
    lang_name = _LANG_NAMES.get(target_language.lower(), "English")
    prompt = f"""Summarize this video/presentation transcript. Return valid JSON only.
Write your entire response in {lang_name}.

Transcript:
{transcript[:6000]}

Return exactly this JSON structure:
{{
  "title": "concise title, max 8 words",
  "summary": "2-3 sentence summary of what was discussed",
  "key_points": ["key point 1", "key point 2", "key point 3", "key point 4"]
}}"""

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=600,
        temperature=0.3,
    )
    return json.loads(response.choices[0].message.content)
