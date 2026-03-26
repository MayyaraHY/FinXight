from .pdf_parser import BaseParser
from config.constants import NOTES_ARTICLE_PATTERNS

class NotesParser(BaseParser):

    def _is_article_header(self, text: str):
        text = text.strip()

        for pattern in NOTES_ARTICLE_PATTERNS:
            if pattern.match(text):
                return True

        return False

    def parse(self, blocks):
        articles = []

        current_article = None
        buffer = []

        for block in blocks:
            text = block.strip()

            if not text:
                continue

            # 🔥 Detect new article
            if self._is_article_header(text):

                # flush previous
                if current_article and buffer:
                    articles.append(self._build_chunk(current_article, buffer))

                current_article = text[:120]  # avoid huge titles
                buffer = []
                continue

            buffer.append(text)

        # last flush
        if current_article and buffer:
            articles.append(self._build_chunk(current_article, buffer))

        return articles

    def _build_chunk(self, article_id, buffer):
        full_text = "\n".join(buffer)

        rubriques = self._extract_rubrique_codes(full_text)
        classes = self._extract_classe_codes(rubriques)

        return {
            "text": full_text,
            "metadata": {
                "doc_type": "notes_comptables",
                "article_id": article_id,
                "rubrique": rubriques,
                "classe": classes,
            }
        }