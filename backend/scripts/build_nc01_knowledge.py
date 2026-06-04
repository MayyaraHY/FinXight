import argparse
import os
import re
import sys
import zipfile


# ---------------------------------------------------------------------------
# Pages to extract and why
# ---------------------------------------------------------------------------
SELECTED_PAGES = {
    5:  "Compensation prohibition (actif/passif netting not allowed)",
    6:  "Current vs non-current asset classification criteria",
    7:  "Non-current liability classification, bilan line items",
    8:  "CR structure: methode reference vs autorisee, separate disclosure rules",
    9:  "Cost of sales formula: stocks + purchases - closing stocks",
    10: "CR line items by method, soldes intermediaires de gestion",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clean(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_from_zip(nc01_path: str) -> dict[int, str]:
    """Handle the zip-of-txt-files format."""
    pages = {}
    with zipfile.ZipFile(nc01_path, "r") as zf:
        for name in zf.namelist():
            if name.endswith(".txt"):
                num = int(os.path.splitext(os.path.basename(name))[0])
                pages[num] = zf.read(name).decode("utf-8", errors="ignore")
    return pages


def extract_from_pdf(nc01_path: str) -> dict[int, str]:
    """Handle a real PDF file — tries pypdf first, falls back to pdfplumber."""
    pages = {}

    # Try pypdf
    try:
        from pypdf import PdfReader
        reader = PdfReader(nc01_path)
        for i, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages[i] = text
        if pages:
            print(f"  Extracted {len(pages)} pages via pypdf")
            return pages
    except Exception as e:
        print(f"  pypdf failed ({e}), trying pdfplumber...")

    # Try pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(nc01_path) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                if text.strip():
                    pages[i] = text
        if pages:
            print(f"  Extracted {len(pages)} pages via pdfplumber")
            return pages
    except Exception as e:
        print(f"  pdfplumber failed ({e})")

    return pages


def extract_pages(nc01_path: str) -> dict[int, str]:
    """Auto-detect format and extract all pages."""
    # Check if it's a zip
    try:
        if zipfile.is_zipfile(nc01_path):
            print("  Detected: zip archive")
            return extract_from_zip(nc01_path)
    except Exception:
        pass

    # Otherwise treat as PDF
    print("  Detected: PDF file")
    return extract_from_pdf(nc01_path)


def build_knowledge(pages: dict[int, str]) -> str:
    sections = []
    for page_num, description in sorted(SELECTED_PAGES.items()):
        if page_num not in pages:
            print(f"  WARNING: page {page_num} not found — skipping")
            continue
        sections.append(
            f"=== NC 01 — Page {page_num} ({description}) ===\n"
            + clean(pages[page_num])
        )
    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--nc01", required=True, help="Path to NC_01.pdf")
    parser.add_argument(
        "--out",
        default=os.path.join("app", "knowledge", "nc01_rules.txt"),
    )
    args = parser.parse_args()

    if not os.path.exists(args.nc01):
        print(f"ERROR: file not found: {args.nc01}")
        sys.exit(1)

    print(f"Reading {args.nc01} ...")
    pages = extract_pages(args.nc01)

    if not pages:
        print("ERROR: could not extract any text from the file.")
        print("Make sure pypdf or pdfplumber is installed:")
        print("  pip install pypdf pdfplumber")
        sys.exit(1)

    print(f"  Found {len(pages)} pages total")

    knowledge = build_knowledge(pages)
    chars, tokens = len(knowledge), len(knowledge) // 4

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(knowledge)

    print(f"Wrote: {args.out}")
    print(f"  Pages   : {sorted(SELECTED_PAGES.keys())}")
    print(f"  Size    : {chars:,} chars (~{tokens:,} tokens)")


if __name__ == "__main__":
    main()