from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class ParsedChunk:
    text: str
    metadata: Dict[str, Any]
    chunk_type: str = "text"
    page_start: int = 0
    page_end: int = 0
    source: str = ""
    table_rows: List[Dict[str, Any]] = field(default_factory=list)
