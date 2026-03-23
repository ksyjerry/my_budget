"""PwC GenAI Gateway async client."""

import asyncio
import json
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_DELAY = 2


class GenAIClient:
    """Async client for PwC Internal GenAI Gateway."""

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 120.0):
        self.base_url = base_url
        self.api_key = api_key
        self.model = model
        self.client = httpx.AsyncClient(timeout=timeout)

    async def complete(
        self, system_prompt: str, user_prompt: str,
        temperature: float = 0.1, max_tokens: int = 4096,
    ) -> str:
        last_error: Exception | None = None

        for attempt in range(MAX_RETRIES):
            try:
                response = await self.client.post(
                    f"{self.base_url}/v1/responses",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    json={
                        "model": self.model,
                        "input": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                response.raise_for_status()
                data = response.json()

                # Responses API format
                if "output" in data:
                    for item in data["output"]:
                        if item.get("type") == "message":
                            for block in item.get("content", []):
                                if block.get("type") == "output_text":
                                    return block["text"]
                            for block in item.get("content", []):
                                if "text" in block:
                                    return block["text"]

                # Chat Completions format
                if "choices" in data:
                    return data["choices"][0]["message"]["content"]

                raise ValueError(f"Unexpected response format: {list(data.keys())}")

            except (httpx.HTTPStatusError, httpx.RequestError, KeyError, ValueError) as e:
                last_error = e
                logger.warning("GenAI attempt %d/%d failed: %s", attempt + 1, MAX_RETRIES, e)
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(RETRY_DELAY * (attempt + 1))

        raise RuntimeError(f"GenAI request failed after {MAX_RETRIES} attempts: {last_error}")

    async def complete_json(
        self, system_prompt: str, user_prompt: str, **kwargs: Any,
    ) -> dict[str, Any]:
        for json_attempt in range(3):
            raw = await self.complete(
                system_prompt=(
                    system_prompt
                    + "\n\nIMPORTANT: Respond ONLY with valid JSON. "
                    "Do NOT include any explanation or markdown formatting. "
                    "Output must start with { and end with }."
                ),
                user_prompt=user_prompt,
                **kwargs,
            )
            cleaned = _extract_json(raw)
            if not cleaned:
                logger.warning("JSON attempt %d/3: no JSON found", json_attempt + 1)
                if json_attempt < 2:
                    await asyncio.sleep(2 * (json_attempt + 1))
                    continue
                raise json.JSONDecodeError("No JSON object found", raw, 0)

            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                if json_attempt < 2:
                    logger.warning("JSON parse failed (attempt %d/3)", json_attempt + 1)
                    await asyncio.sleep(2 * (json_attempt + 1))
                else:
                    raise

    async def close(self):
        await self.client.aclose()


def _extract_json(raw: str) -> str:
    text = raw.strip()

    if "```" in text:
        fence_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", text)
        if fence_match:
            text = fence_match.group(1).strip()

    if text.startswith("{"):
        return text

    first_brace = text.find("{")
    if first_brace < 0:
        return ""

    depth = 0
    in_string = False
    escape_next = False
    for i in range(first_brace, len(text)):
        ch = text[i]
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            if in_string:
                escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[first_brace : i + 1]

    return text[first_brace:]
