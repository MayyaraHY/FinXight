import re
import fitz
from typing import List, Dict

from .models import ParsedChunk
from config.constants import (
    DOC_TYPE_BILAN,
    DOC_TYPE_RESULTAT,
    DOC_TYPE_NOTES,
    NOTES_ARTICLE_PATTERNS,
)


class _BaseParser:
    def _open_pages(self, path: str):
        doc = fitz.open(path)
        try:
            for page_num, page in enumerate(doc):
                blocks = page.get_text("dict").get("blocks", [])
                yield page_num, blocks
        finally:
            doc.close()

    @staticmethod
    def _extract_block_text(block: dict) -> str:
        lines = block.get("lines", [])
        parts = []
        for line in lines:
            for span in line.get("spans", []):
                t = span.get("text", "").strip()
                if t:
                    parts.append(t)
        return " ".join(parts).strip()


class NotesParser(_BaseParser):
    """Simple NC01 parser fallback used by custom pipeline modules."""

    def parse(self, path: str, doc_type: str = DOC_TYPE_NOTES) -> List[ParsedChunk]:
        out: List[ParsedChunk] = []
        for page_num, blocks in self._open_pages(path):
            for block in blocks:
                text = self._extract_block_text(block)
                if not text:
                    continue
                section = "UNKNOWN"
                for pat in NOTES_ARTICLE_PATTERNS:
                    if re.search(pat, text, flags=re.IGNORECASE):
                        section = "ARTICLE"
                        break
                out.append(
                    ParsedChunk(
                        text=text,
                        metadata={"doc_type": doc_type, "section": section, "line_numbers": []},
                        chunk_type="text",
                        page_start=page_num,
                        page_end=page_num,
                        source=path,
                    )
                )
        return out


class BilanParser(NotesParser):
    def parse(self, path: str, doc_type: str = DOC_TYPE_BILAN) -> List[ParsedChunk]:
        return super().parse(path, doc_type)


class ResultatParser(NotesParser):
    def parse(self, path: str, doc_type: str = DOC_TYPE_RESULTAT) -> List[ParsedChunk]:
        return super().parse(path, doc_type)


class FinancialPDFParser:
    def parse(self, path: str, doc_type: str) -> List[ParsedChunk]:
        if doc_type == DOC_TYPE_BILAN:
            return BilanParser().parse(path, doc_type)
        if doc_type == DOC_TYPE_RESULTAT:
            return ResultatParser().parse(path, doc_type)
        if doc_type == DOC_TYPE_NOTES:
            return NotesParser().parse(path, doc_type)
        raise ValueError(f"Unknown doc_type '{doc_type}'")
