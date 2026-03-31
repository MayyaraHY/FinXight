import re
from typing import List

from .models import ParsedChunk
from config.constants import NOTES_MAX_CHARS, RESULTAT_STRUCTURE, YEAR_RANGE


class FinancialChunker:
    """Domain-aware chunker entry point."""

    def chunk(self, parsed_chunks: List[ParsedChunk], doc_type: str = "notes_comptables") -> List[ParsedChunk]:
        if not parsed_chunks:
            return []
        return _NotesChunker().chunk(parsed_chunks)


# NOTE:
# Bilan and Resultat chunkers are not yet used in the current pipeline (NC01 only).
# Keep for future multi-document support.


class _NotesChunker:
    def chunk(self, parsed_chunks: List[ParsedChunk]) -> List[ParsedChunk]:
        final: List[ParsedChunk] = []

        for chunk in parsed_chunks:
            sub_chunks = self._split_if_large(chunk)

            for sc in sub_chunks:
                found_codes = self._extract_codes(sc.text)
                linked_lines = [
                    line_id
                    for line_id, info in RESULTAT_STRUCTURE.items()
                    if any(code in found_codes for code in info.get("accounts", []))
                ]

                sc.metadata["rubrique"] = found_codes
                sc.metadata["linked_resultat_lines"] = list(set(linked_lines))
                sc.metadata["rubrique_tags"] = self._build_tags(sc)
                final.append(sc)

        return final

    def _split_if_large(self, chunk: ParsedChunk) -> List[ParsedChunk]:
        if len(chunk.text) <= NOTES_MAX_CHARS:
            return [chunk]

        paragraphs = [p.strip() for p in chunk.text.split("\n") if p.strip()]
        out: List[ParsedChunk] = []
        buf: List[str] = []
        buf_len = 0

        for para in paragraphs:
            if buf and buf_len + len(para) > NOTES_MAX_CHARS:
                out.append(self._make_sub(chunk, buf))
                buf = []
                buf_len = 0
            buf.append(para)
            buf_len += len(para)

        if buf:
            out.append(self._make_sub(chunk, buf))

        return out or [chunk]

    def _make_sub(self, parent: ParsedChunk, paragraphs: List[str]) -> ParsedChunk:
        text = "\n".join(paragraphs)
        meta = dict(parent.metadata)
        return ParsedChunk(
            text=text,
            metadata=meta,
            chunk_type=parent.chunk_type,
            page_start=parent.page_start,
            page_end=parent.page_end,
            source=parent.source,
        )

    def _extract_codes(self, text: str) -> List[str]:
        pattern = r"(?<![.\d])(\(?-?\d{2,4}\)?)(?![.\d])"
        raw = re.findall(pattern, text)
        seen = set()
        codes: List[str] = []
        for code in raw:
            key = re.sub(r"[()\-]", "", code)
            if key and key not in seen and key not in YEAR_RANGE:
                seen.add(key)
                codes.append(key)
        return codes

    def _build_tags(self, chunk: ParsedChunk) -> List[str]:
        tags: List[str] = []
        for code in chunk.metadata.get("rubrique", []):
            if code and code[0].isdigit():
                tags.append(f"class{code[0]}:{code}")
        return tags
