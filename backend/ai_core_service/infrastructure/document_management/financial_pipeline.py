from typing import List
from .pdf_parser import FinancialPDFParser
from .notes_parser import NotesParser
from .chunker import FinancialChunker
from config.constants import DOC_TYPE_NOTES, VALID_CLASSES
from .models import ParsedChunk


class FinancialPipeline:
    def __init__(self):
        self.parser = NotesParser() if DOC_TYPE_NOTES else FinancialPDFParser()
        self.chunker = FinancialChunker(chunk_size=512, overlap=64)

    def process(self, path: str, force_type: str = None) -> List[ParsedChunk]:
        """End-to-end parsing/chunking with validation."""
        doc_type = force_type or self._detect_doc_type(path)
        parsed = self.parser.parse(path, doc_type)
        chunks = self.chunker.chunk(parsed, doc_type)
        return [c for c in chunks if self._validate_chunk(c)]

    def _validate_chunk(self, chunk: ParsedChunk) -> bool:
        """Ensure chunk meets quality standards."""
        metadata = chunk["metadata"]
        return all([
            bool(metadata.get("doc_type")),
            not metadata.get("classe") or all(c in VALID_CLASSES for c in metadata["classe"]),
            len(chunk["text"]) <= 2000,  # Hard limit
        ])