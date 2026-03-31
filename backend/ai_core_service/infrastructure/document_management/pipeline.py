import os
import traceback
from typing import Dict

from llmware.configs import LLMWareConfig
from llmware.library import Library
from llmware.resources import SQLiteConfig
from llmware.retrieval import Query

from config.constants import (
    LLMWARE_DATA_PATH,
    LIBRARY_NAMES,
    DOC_TYPE_NOTES,
    RESULTAT_STRUCTURE,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_VECTOR_DB,
    NC01_ABS_PATH,
)


def _configure_llmware(data_path: str = LLMWARE_DATA_PATH, vector_db: str = DEFAULT_VECTOR_DB) -> None:
    data_path = os.path.abspath(data_path)
    LLMWareConfig().set_home(data_path)
    LLMWareConfig().set_vector_db(vector_db)
    os.makedirs(data_path, exist_ok=True)
    if not os.path.exists(LLMWareConfig.get_llmware_path()):
        LLMWareConfig.setup_llmware_workspace()
    SQLiteConfig.set_config("sqlite_db_folder_path", LLMWareConfig.get_library_path())


_configure_llmware()


class NC01Pipeline:
    def __init__(self):
        self.lib_name = LIBRARY_NAMES[DOC_TYPE_NOTES]
        self.embedding_model = DEFAULT_EMBEDDING_MODEL
        self.vector_db = DEFAULT_VECTOR_DB
        self._initialized = False
        self.lib = self._setup_library()

    def _setup_library(self):
        manager = Library()
        try:
            return manager.load_library(self.lib_name)
        except Exception:
            return manager.create_new_library(self.lib_name)

    def _get_block_count(self) -> int:
        card = self.lib.get_library_card()
        if isinstance(card, dict):
            return int(card.get("blocks", 0) or 0)
        return 0

    def _has_embeddings(self) -> bool:
        try:
            status = self.lib.get_embedding_status()
            if isinstance(status, list):
                return any(int(s.get("embedded_blocks", 0) or 0) > 0 for s in status if isinstance(s, dict))
            if isinstance(status, dict):
                return int(status.get("embedding_count", 0) or 0) > 0
        except Exception:
            pass

        card = self.lib.get_library_card()
        if isinstance(card, dict):
            emb = card.get("embedding", [])
            if isinstance(emb, list):
                return any(int(s.get("embedded_blocks", 0) or 0) > 0 for s in emb if isinstance(s, dict))
        return False

    def ingest_nc01(self, pdf_path: str = None):
        target_path = pdf_path or NC01_ABS_PATH
        if not os.path.exists(target_path):
            raise FileNotFoundError(f"NC_01 file not found at {target_path}")

        print(f"--- Ingesting NC_01 from: {target_path} ---")

        try:
            self._initialized = False
            try:
                Library().delete_library(self.lib_name, confirm_delete=True)
            except Exception as e:
                print(f"Warning: Could not delete old library: {e}")

            self.lib = self._setup_library()
            self.lib.add_file(target_path)

            block_count = self._get_block_count()
            print(f"DEBUG: Blocks created: {block_count}")
            if block_count == 0:
                raise ValueError("No text blocks were parsed. Is the PDF valid?")

            print(f"--- Indexing with {self.embedding_model} ---")
            self.lib.install_new_embedding(
                embedding_model_name=self.embedding_model,
                vector_db=self.vector_db,
            )

            self._initialized = True
            return {"status": "success", "blocks": block_count}
        except Exception as e:
            self._initialized = False
            print(f"PIPELINE ERROR: {str(e)}")
            traceback.print_exc()
            raise e

    def perform_query(self, question: str):
        if not self._initialized:
            self._initialized = self._has_embeddings()
            if not self._initialized:
                raise RuntimeError("Library not initialized. Please run POST /initialize first.")

        query_obj = Query(self.lib)
        try:
            return query_obj.semantic_query(
                question,
                result_count=3,
                embedding_model_name=self.embedding_model,
                vector_db=self.vector_db,
            )
        except TypeError:
            return query_obj.semantic_query(question, result_count=3)

    def ask_nc01(self, question: str):
        return self.perform_query(question)

    def get_smart_explanation(self, line_number: str):
        struct = RESULTAT_STRUCTURE.get(str(line_number))
        if not struct:
            return {
                "line": str(line_number),
                "label": "Unknown line",
                "nc01_rules": [],
            }

        search_query = struct["label"]
        if struct.get("class_ref"):
            search_query += f" Classe {struct['class_ref']}"

        search_results = self.perform_query(search_query)

        return {
            "line": str(line_number),
            "label": struct.get("label", "Unknown line"),
            "accounting_class": struct.get("class_ref"),
            "mapped_accounts": struct.get("accounts", []),
            "formula": struct.get("formula"),
            "nc01_rules": [r.get("text", "") for r in search_results],
        }


class FinancialPipeline:
    """Compatibility wrapper used by legacy test.py workflow."""

    def __init__(self):
        self.nc01 = NC01Pipeline()
        self._doc_libs: Dict[str, Library] = {}

    def ingest_all(self, files: Dict[str, str]) -> Dict[str, int]:
        stats: Dict[str, int] = {}
        for doc_type, path in files.items():
            if not os.path.exists(path):
                stats[doc_type] = 0
                continue
            lib_name = LIBRARY_NAMES.get(doc_type, LIBRARY_NAMES[DOC_TYPE_NOTES])
            try:
                Library().delete_library(lib_name, confirm_delete=True)
            except Exception:
                pass
            manager = Library()
            lib = manager.create_new_library(lib_name)
            lib.add_file(path)
            card = lib.get_library_card()
            stats[doc_type] = int(card.get("blocks", 0) or 0) if isinstance(card, dict) else 0
            self._doc_libs[doc_type] = lib

        if DOC_TYPE_NOTES in files and os.path.exists(files[DOC_TYPE_NOTES]):
            self.nc01.ingest_nc01(files[DOC_TYPE_NOTES])

        return stats

    def embed_all(self) -> None:
        for lib in self._doc_libs.values():
            lib.install_new_embedding(
                embedding_model_name=DEFAULT_EMBEDDING_MODEL,
                vector_db=DEFAULT_VECTOR_DB,
            )

    def get_line_explanation(self, line_or_question: str):
        if str(line_or_question).strip().isdigit():
            detail = self.nc01.get_smart_explanation(str(line_or_question))
            return {
                "official_label": detail.get("label"),
                "accounts_to_use": detail.get("mapped_accounts", []),
                "formula": detail.get("formula"),
                "regulatory_details": detail.get("nc01_rules", []),
            }

        results = self.nc01.ask_nc01(str(line_or_question))
        return {
            "official_label": "Question",
            "accounts_to_use": [],
            "formula": None,
            "regulatory_details": [r.get("text", "") for r in results],
        }
