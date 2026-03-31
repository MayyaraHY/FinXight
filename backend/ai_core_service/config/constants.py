from typing import Dict
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

NC01_FILENAME = os.getenv("NC01", "NC_01.pdf")
NC01_SUBFOLDER = os.getenv("NC01_SUBFOLDER", "data")
LLMWARE_DATA_PATH = os.getenv("LLMWARE_DATA_PATH", os.path.join(PROJECT_ROOT, "llmware_data"))
NC01_ABS_PATH = os.path.join(PROJECT_ROOT, NC01_SUBFOLDER, NC01_FILENAME)

os.makedirs(LLMWARE_DATA_PATH, exist_ok=True)

DOC_TYPE_BILAN = "maquette_bilan"
DOC_TYPE_RESULTAT = "maquette_resultat"
DOC_TYPE_NOTES = "notes_comptables"

LIBRARY_NAMES: Dict[str, str] = {
    DOC_TYPE_BILAN: "tunisian_bilan_lib",
    DOC_TYPE_RESULTAT: "tunisian_resultat_lib",
    DOC_TYPE_NOTES: "nc01_semantic_lib",
}

DEFAULT_EMBEDDING_MODEL = "mini-lm-sbert"
DEFAULT_VECTOR_DB = "chromadb"
NOTES_MAX_CHARS = 1200

YEAR_RANGE = set(str(y) for y in range(1900, 2100))
VALID_CLASSES = {"1", "2", "3", "4", "5", "6", "7", "8", "9"}

NOTES_ARTICLE_PATTERNS = [
    r"^NC\\s+\\d+",
    r"^NCT[\\s\\-]\\d+",
    r"^Art(?:icle)?\\.?\\s*\\d+",
    r"^\\d+\\.\\s{1,}\\S",
    r"^\\d+\\.\\d+",
    r"^Classe\\s+[1-9]",
    r"^[A-Z\\s]{5,80}$",
]

NOTES_RULE_KEYWORDS = [
    "doit", "doivent", "obligatoire", "interdit", "conformement", "tenu de",
]

NOTES_DEFINITION_KEYWORDS = [
    "s'entend par", "designe", "signifie", "represente", "comprend", "defini comme",
]

NOTES_EXAMPLE_KEYWORDS = [
    "par exemple", "notamment", "tels que", "comme", "ainsi", "en particulier",
]

BILAN_SECTION_MARKERS = [
    "Actif", "Passif", "Actif Immobilise", "Actif Courant", "Passif Courant", "Capitaux Propres",
]

BILAN_COLUMN_X_RANGES = {
    "label": (0, 260),
    "col_1": (260, 380),
    "col_2": (380, 500),
    "col_3": (500, 700),
}

BILAN_HIERARCHY = {
    "Actif Immobilise": "Actif",
    "Actif Courant": "Actif",
    "Passif Courant": "Passif",
    "Capitaux Propres": "Passif",
}

RESULTAT_SECTION_MARKERS = [
    "Produits d'exploitation",
    "Charges d'exploitation",
    "Resultat d'exploitation",
    "Produits financiers",
    "Charges financieres",
    "Resultat net",
]

RESULTAT_COLUMN_X_RANGES = {
    "line_num": (0, 100),
    "label": (100, 420),
    "amount_n": (420, 560),
    "amount_n1": (560, 760),
}

RESULTAT_LINE_NUMBERS = [str(i) for i in range(1, 24)]

RESULTAT_FORMULAS = {
    "4": "1 + 2 + 3",
    "11": "5 + 6 + 7 + 8 + 9 + 10",
    "12": "4 - 11",
    "15": "13 - 14",
    "17": "12 - 13 + 14 + 15 - 16",
    "20": "12 + 15 + 16 - 18",
    "23": "20 - 21 - 22",
}

RESULTAT_HIERARCHY = {
    "Produits d'exploitation": "Exploitation",
    "Charges d'exploitation": "Exploitation",
    "Produits financiers": "Financier",
    "Charges financieres": "Financier",
}

RESULTAT_STRUCTURE = {
    "1": {"label": "Revenus", "class_ref": "7", "accounts": ["701", "702", "703", "704", "705", "706", "707", "708"], "formula": None},
    "2": {"label": "Achats de matieres premieres", "class_ref": "6", "accounts": ["601", "602"], "formula": None},
    "3": {"label": "Variation de stocks", "class_ref": "6", "accounts": ["71"], "formula": None},
    "4": {"label": "Total des produits d'exploitation", "class_ref": "7", "accounts": [], "formula": "1 + 2 + 3"},
    "5": {"label": "Autres achats et charges externes", "class_ref": "6", "accounts": ["604", "605", "606"], "formula": None},
    "6": {"label": "Achats de marchandises consommes", "class_ref": "6", "accounts": ["603", "60"], "formula": None},
    "7": {"label": "Impots et taxes", "class_ref": "6", "accounts": ["635"], "formula": None},
    "8": {"label": "Salaires et traitements", "class_ref": "6", "accounts": ["641", "642"], "formula": None},
    "9": {"label": "Charges sociales", "class_ref": "6", "accounts": ["645", "646"], "formula": None},
    "10": {"label": "Dotations aux amortissements", "class_ref": "6", "accounts": ["681", "682"], "formula": None},
    "11": {"label": "Total des charges d'exploitation", "class_ref": "6", "accounts": [], "formula": "5 + 6 + 7 + 8 + 9 + 10"},
    "12": {"label": "Resultat d'exploitation", "class_ref": None, "accounts": [], "formula": "4 - 11"},
    "13": {"label": "Produits financiers", "class_ref": "7", "accounts": ["761", "762", "763"], "formula": None},
    "14": {"label": "Charges financieres", "class_ref": "6", "accounts": ["661", "662"], "formula": None},
    "15": {"label": "Resultat financier", "class_ref": None, "accounts": [], "formula": "13 - 14"},
    "16": {"label": "Produits exceptionnels", "class_ref": "7", "accounts": ["771", "772"], "formula": None},
    "17": {"label": "Resultat des activites ordinaires avant impot", "class_ref": None, "accounts": [], "formula": "12 - 13 + 14 + 15 - 16"},
    "18": {"label": "Charges exceptionnelles", "class_ref": "6", "accounts": ["671", "672"], "formula": None},
    "19": {"label": "Quote-part de resultat sur operations faites en commun", "class_ref": None, "accounts": [], "formula": None},
    "20": {"label": "Resultat avant impot", "class_ref": None, "accounts": [], "formula": "12 + 15 + 16 - 18"},
    "21": {"label": "Impots sur les resultats", "class_ref": "6", "accounts": ["695"], "formula": None},
    "22": {"label": "Resultats des activites abandonnees", "class_ref": None, "accounts": [], "formula": None},
    "23": {"label": "Resultat net", "class_ref": None, "accounts": [], "formula": "20 - 21 - 22"},
}

ASSET_KEYWORDS = ["actif", "stock", "client", "liquidite", "immobilisation"]
LIABILITY_KEYWORDS = ["passif", "fournisseur", "emprunt", "dettes"]
EQUITY_KEYWORDS = ["capitaux propres", "capital", "reserve"]
REVENUE_KEYWORDS = ["produit", "revenu", "chiffre d'affaires"]
EXPENSE_KEYWORDS = ["charge", "dotation", "achat", "personnel"]
TOTAL_KEYWORDS = ["total", "sous-total", "cumule", "ensemble"]

BILAN_COLS_ASSETS = {
    "label": (0, 220),
    "brut": (220, 330),
    "amort": (330, 440),
    "net": (440, 600),
}

BILAN_COLS_LIABILITIES = {
    "label": (0, 350),
    "accounts": (350, 450),
    "net_n": (450, 525),
    "net_n1": (525, 600),
}
