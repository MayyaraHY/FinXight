import re
NOTES_ARTICLE_PATTERNS = [
 # NC format
    r"^NC\s+\d+",

    # Numbered paragraphs (1. Text)
    r"^\d+\.\s{1,}",

    # Section titles
    r"^[A-ZÉÈÊÀÂ][A-Za-zéèêàâç\s'\-]+\s*:$",

    # Parts
    r"^PREMIÈRE PARTIE",
    r"^DEUXIÈME PARTIE",
    r"^TROISIÈME PARTIE",

    # Annexes
    r"^Annexe\s+\d+",

    # Classes
    r"^Classe\s+\d+\s*:?",

    # Nomenclature headers
    r"^Liste des comptes\s+Classe\s+\d+",

    # Account headers
    r"^\d{2,3}\s+[A-Z]",                    # 101 Capital
]

# Years filter
YEAR_RANGE = set(str(y) for y in range(1900, 2100))

# Valid accounting classes
VALID_CLASSES = {'1','2','3','4','5','6','7','8','9'}