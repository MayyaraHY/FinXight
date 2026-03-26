# doc_router.py

import re

class DocumentRouter:

    def detect(self, text: str) -> str:
        t = text.lower()

        # NOTES COMPTABLES (highest priority)
        if (
            "norme comptable" in t or
            "nct" in t or
            "article" in t and "doit" in t or
            "on entend par" in t
        ):
            return "notes_comptables"

        # RESULTAT
        if (
            "résultat" in t or
            "charges d'exploitation" in t or
            "produits d'exploitation" in t
        ):
            return "maquette_resultat"

        # BILAN
        if (
            "actifs" in t or
            "passifs" in t or
            "capitaux propres" in t
        ):
            return "maquette_bilan"

        return "unknown"