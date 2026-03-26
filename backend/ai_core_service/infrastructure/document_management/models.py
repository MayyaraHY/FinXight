# infrastructure/document_management/models.py

from dataclasses import dataclass, field
from typing import List, Dict, Optional

@dataclass
class ParsedChunk:
    text: str
    metadata: Dict

@dataclass
class FinalChunk:
    text: str
    metadata: Dict