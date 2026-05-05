r"""
One-shot diagnostic: list every Gemini model your API key can call,
filtered to those that support generateContent.

Usage:
    cd ai_service
    venv_ai\Scripts\activate
    python list_models.py
"""
from google import genai
from app.core.config import settings


def main() -> None:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    print(f"Listing models accessible to API key ending in ...{settings.GEMINI_API_KEY[-6:]}\n")

    rows = []
    for m in client.models.list():
        actions = getattr(m, "supported_actions", None) or getattr(m, "supported_methods", [])
        if "generateContent" in actions:
            rows.append(m.name)

    if not rows:
        print("No models support generateContent for this API key.")
        return

    print(f"Models supporting generateContent ({len(rows)}):")
    for name in rows:
        print(f"  - {name}")
    print(
        "\nRecommended .env line (drop the 'models/' prefix when used):\n"
        f"  GEMINI_MODEL_NAME={rows[0].replace('models/', '')}"
    )


if __name__ == "__main__":
    main()
