# infrastructure/document_management/pdf_parser.py

import re
from typing import List
import fitz

from .models import ParsedChunk
from config.constants import NOTES_ARTICLE_PATTERNS

class FinancialPDFParser:

    def __init__(self):
        self.article_res = [re.compile(p, re.IGNORECASE) for p in NOTES_ARTICLE_PATTERNS]
    def parse(self, file_path: str, doc_type: str) -> List[ParsedChunk]:
        if doc_type == "notes_comptables":
            return self._parse_notes(file_path)
        else:
            return self._parse_simple(file_path, doc_type)

    # -----------------------------
    # ✅ NOTES PARSER (FITZ VERSION)
    # -----------------------------
    def _parse_notes(self, file_path: str) -> List[ParsedChunk]:
        chunks = []

        current_article = []
        current_article_id = None

        doc = fitz.open(file_path)

        for page_num, page in enumerate(doc):
            text = page.get_text("text")  # 🔥 FITZ extraction

            lines = text.split("\n")

            for line in lines:
                line = line.strip()

                if not line:
                    continue

                # 🔥 ARTICLE DETECTION
                if self._is_article_header(line):

                    # flush previous article
                    if current_article:
                        chunks.append(self._build_chunk(current_article, current_article_id))
                        current_article = []

                    current_article_id = line[:100]
                    current_article.append(line)

                else:
                    current_article.append(line)

        # flush last
        if current_article:
            chunks.append(self._build_chunk(current_article, current_article_id))

        doc.close()

        return chunks

    def _is_article_header(self, line: str) -> bool:
        return any(p.match(line) for p in self.article_res)

    def _build_chunk(self, lines: List[str], article_id: str) -> ParsedChunk:
        return ParsedChunk(
            text="\n".join(lines),
            metadata={
                "doc_type": "notes_comptables",
                "article_id": article_id
            }
        )

    # -----------------------------
    # SIMPLE PARSER (FITZ)
    # -----------------------------
    def _parse_simple(self, file_path: str, doc_type: str) -> List[ParsedChunk]:
        chunks = []

        doc = fitz.open(file_path)

        for page_num, page in enumerate(doc):
            text = page.get_text("text")

            chunks.append(
                ParsedChunk(
                    text=text,
                    metadata={
                        "doc_type": doc_type,
                        "page": page_num
                    }
                )
            )

        doc.close()

        return chunks
    


######################################
YEAR_RANGE = set(str(y) for y in range(1900, 2100))
VALID_CLASSES = {'1','2','3','4','5','6','7','8','9'}
class BaseParser:

    def _extract_rubrique_codes(self, text: str):
        codes = re.findall(r"\(?-?\d{2,4}\)?", text)

        cleaned = set()
        for code in codes:
            code = code.strip("()-")

            # ❌ remove years
            if code in YEAR_RANGE:
                continue

            # ❌ remove 1-digit garbage
            if len(code) < 2:
                continue

            # ❌ remove paragraph numbers like 01, 02
            if int(code) < 10:
                continue

            cleaned.add(code)

        return sorted(cleaned)

    def _extract_classe_codes(self, rubriques):
        classes = {r[0] for r in rubriques if r}
        return sorted(c for c in classes if c in VALID_CLASSES)