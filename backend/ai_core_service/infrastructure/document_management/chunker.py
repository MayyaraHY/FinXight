# infrastructure/document_management/chunker.py

import re
from typing import List

from .models import ParsedChunk, FinalChunk
from config.constants import YEAR_RANGE, VALID_CLASSES


MAX_CHARS = 1000

class FinancialChunker:

    def chunk(self, parsed_chunks, doc_type):
        final_chunks = []

        for chunk in parsed_chunks:
            text = chunk["text"]
            metadata = chunk["metadata"]

            if len(text) <= MAX_CHARS:
                metadata["sub_chunk_index"] = 0
                metadata["sub_chunk_total"] = 1
                final_chunks.append(self._wrap(text, metadata))
                continue

            parts = self._split_text(text)

            for i, part in enumerate(parts):
                new_meta = metadata.copy()
                new_meta["sub_chunk_index"] = i
                new_meta["sub_chunk_total"] = len(parts)

                final_chunks.append(self._wrap(part, new_meta))

        return final_chunks

    def _split_text(self, text):
        sentences = text.split(". ")
        chunks = []
        current = ""

        for s in sentences:
            if len(current) + len(s) < MAX_CHARS:
                current += s + ". "
            else:
                chunks.append(current.strip())
                current = s + ". "

        if current:
            chunks.append(current.strip())

        return chunks

    def _wrap(self, text, metadata):
        return type("Chunk", (), {
            "text": text,
            "metadata": metadata
        })

    # -----------------------------
    # SPLIT LOGIC
    # -----------------------------
    def _split_text(self, text: str) -> List[str]:
        if len(text) <= MAX_CHARS:
            return [text]

        parts = []
        current = ""

        for line in text.split("\n"):
            if len(current) + len(line) < MAX_CHARS:
                current += line + "\n"
            else:
                parts.append(current.strip())
                current = line + "\n"

        if current:
            parts.append(current.strip())

        return parts

    # -----------------------------
    # RUBRIQUE EXTRACTION (FIXED)
    # -----------------------------
    def _extract_rubrique(self, text: str) -> List[str]:
        codes = re.findall(r"\b\d{2,4}\b", text)

        clean = set()

        for c in codes:
            if c in YEAR_RANGE:
                continue  # remove years

            if len(c) == 2 and int(c) < 10:
                continue  # remove 01, 02...

            clean.add(c)

        return sorted(clean)

    # -----------------------------
    # CLASSE EXTRACTION (FIXED)
    # -----------------------------
    def _extract_classes(self, rubrique: List[str]) -> List[str]:
        classes = set()

        for r in rubrique:
            if len(r) >= 2:
                c = r[0]
                if c in VALID_CLASSES:
                    classes.add(c)

        return sorted(classes)

    # -----------------------------
    # BASIC CHUNKING
    # -----------------------------
    def _basic_chunk(self, parsed_chunks: List[ParsedChunk]) -> List[FinalChunk]:
        return [
            FinalChunk(text=c.text, metadata=c.metadata)
            for c in parsed_chunks
        ]