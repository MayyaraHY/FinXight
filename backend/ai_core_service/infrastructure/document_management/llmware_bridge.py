import os
from typing import Any, Dict, List, Optional

from llmware.configs import LLMWareConfig
from llmware.library import Library
from llmware.retrieval import Query
from llmware.resources import SQLiteConfig

from config.constants import (
    LLMWARE_DATA_PATH,
    LIBRARY_NAMES,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_VECTOR_DB,
)


def configure_llmware(data_path: str = LLMWARE_DATA_PATH, vector_db: str = DEFAULT_VECTOR_DB) -> None:
    data_path = os.path.abspath(data_path)
    LLMWareConfig().set_home(data_path)
    LLMWareConfig().set_vector_db(vector_db)
    os.makedirs(data_path, exist_ok=True)
    if not os.path.exists(LLMWareConfig.get_llmware_path()):
        LLMWareConfig.setup_llmware_workspace()
    SQLiteConfig.set_config("sqlite_db_folder_path", LLMWareConfig.get_library_path())


class FinancialLibraryManager:
    def __init__(self, embedding_model: str = DEFAULT_EMBEDDING_MODEL, vector_db: str = DEFAULT_VECTOR_DB):
        configure_llmware()
        self.embedding_model = embedding_model
        self.vector_db = vector_db
        self._libraries: Dict[str, Library] = {}

    def get_library(self, doc_type: str) -> Library:
        if doc_type not in self._libraries:
            name = LIBRARY_NAMES[doc_type]
            mgr = Library()
            try:
                self._libraries[doc_type] = mgr.load_library(name)
            except Exception:
                self._libraries[doc_type] = mgr.create_new_library(name)
        return self._libraries[doc_type]

    def ingest_pdf(self, pdf_path: str, doc_type: str) -> int:
        lib = self.get_library(doc_type)
        lib.add_file(pdf_path)
        card = lib.get_library_card()
        return int(card.get("blocks", 0) or 0) if isinstance(card, dict) else 0

    def embed(self, doc_type: str) -> None:
        lib = self.get_library(doc_type)
        lib.install_new_embedding(embedding_model_name=self.embedding_model, vector_db=self.vector_db)

    def query(self, query_text: str, doc_type: str, top_k: int = 5) -> List[Dict[str, Any]]:
        lib = self.get_library(doc_type)
        q = Query(lib)
        try:
            return q.semantic_query(
                query_text,
                result_count=top_k,
                embedding_model_name=self.embedding_model,
                vector_db=self.vector_db,
            )
        except TypeError:
            return q.semantic_query(query_text, result_count=top_k)

    def filtered_query(
        self,
        query_text: str,
        doc_type: str,
        top_k: int = 5,
        filter_role: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        results = self.query(query_text, doc_type, top_k=top_k * 2)
        if not filter_role:
            return results[:top_k]
        out = []
        for r in results:
            md = r.get("metadata_dict", {})
            if md.get("financial_role") == filter_role:
                out.append(r)
        return out[:top_k]
