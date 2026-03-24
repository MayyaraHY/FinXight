# infrastructure/document_management/pdf_parser.py
import fitz
from dataclasses import dataclass
from typing import Optional

@dataclass
class ParsedChunk:
    text: str
    metadata: dict
    chunk_type: str  # "table", "section", "header", "note"
    page_number: int
    source: str

class FinancialPDFParser:
    def parse(self, path: str, doc_type: str) -> list[ParsedChunk]:
        doc = fitz.open(path)
        chunks = []
        for page_num, page in enumerate(doc):
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                chunk = self._classify_and_extract(block, page_num, doc_type, path)
                if chunk:
                    chunks.append(chunk)
        return chunks

    def _classify_and_extract(self, block, page_num, doc_type, source) -> Optional[ParsedChunk]:
        if block["type"] == 0:  # text
            text = " ".join([span["text"] for line in block["lines"] for span in line["spans"]])
            if len(text.strip()) < 10:
                return None
            chunk_type = self._detect_type(text, block)
            return ParsedChunk(
                text=text.strip(),
                metadata={
                    "doc_type": doc_type,           # "maquette_bilan", "note_comptable"
                    "page": page_num,
                    "chunk_type": chunk_type,
                    "classe": self._extract_classe(text),   # "1", "2", ... "7"
                    "rubrique": self._extract_rubrique(text),
                    "is_total_line": self._is_total(text),
                    "language": self._detect_lang(text),    # "fr", "ar"
                },
                chunk_type=chunk_type,
                page_number=page_num,
                source=source
            )

    def _detect_type(self, text, block) -> str:
        if any(kw in text.lower() for kw in ["total", "sous-total", "actif", "passif"]):
            return "aggregate_line"
        if text.isupper() and len(text) < 60:
            return "header"
        return "section"