from infrastructure.document_management.pdf_parser import FinancialPDFParser
from infrastructure.document_management.chunker import FinancialChunker


def test_notes_pipeline():
    print("\n🚀 Testing Notes Comptables Pipeline...\n")

    parser = FinancialPDFParser()
    chunker = FinancialChunker()

    # Step 1: Parse PDF
    parsed_chunks = parser.parse("data/NC_01.pdf", "notes_comptables")

    print(f"✅ Parsed articles: {len(parsed_chunks)}\n")

    # Debug: show first 3 parsed articles
    print("🔍 SAMPLE PARSED ARTICLES:\n")
    for i, chunk in enumerate(parsed_chunks[:3]):
        print(f"[ARTICLE {i}]")
        print("Article ID:", chunk.metadata.get("article_id"))
        print("Text preview:", chunk.text[:200])
        print("Rubriques:", chunk.metadata.get("rubrique", [])[:10])
        print("Classes:", chunk.metadata.get("classe", []))
        print("-" * 50)

    # Step 2: Chunking
    final_chunks = chunker.chunk(parsed_chunks, "notes_comptables")

    print(f"\n✅ Final chunks after splitting: {len(final_chunks)}\n")

    # Debug: show first 5 final chunks
    print("🔍 SAMPLE FINAL CHUNKS:\n")
    for i, c in enumerate(final_chunks[:5]):
        print(f"[CHUNK {i}]")
        print("Article ID:", c.metadata.get("article_id"))
        print("Sub chunk:", f"{c.metadata.get('sub_chunk_index')} / {c.metadata.get('sub_chunk_total')}")
        print("Text preview:", c.text[:200])
        print("Rubriques:", c.metadata.get("rubrique", [])[:10])
        print("Classes:", c.metadata.get("classe", []))
        print("=" * 60)

    # Step 3: VALIDATION CHECKS
    print("\n🧪 VALIDATION CHECKS:\n")

    # 1. Ensure not too many articles (over-splitting)
    if len(parsed_chunks) > 300:
        print("❌ ERROR: Too many articles → over-splitting")
    else:
        print("✅ Article count looks reasonable")

    # 2. Ensure article_id exists
    missing_ids = [c for c in parsed_chunks if not c.metadata.get("article_id")]
    if missing_ids:
        print(f"❌ ERROR: {len(missing_ids)} chunks missing article_id")
    else:
        print("✅ All chunks have article_id")

    # 3. Ensure no years in rubrique
    bad_codes = []
    for c in final_chunks:
        for r in c.metadata.get("rubrique", []):
            if r.isdigit() and 1900 <= int(r) <= 2100:
                bad_codes.append(r)

    if bad_codes:
        print("❌ ERROR: Found year-like codes:", bad_codes[:10])
    else:
        print("✅ No year pollution in rubrique")

    # 4. Ensure valid classes
    invalid_classes = []
    for c in final_chunks:
        for cl in c.metadata.get("classe", []):
            if cl not in {'1','2','3','4','5','6','7','8','9'}:
                invalid_classes.append(cl)

    if invalid_classes:
        print("❌ ERROR: Invalid classes:", invalid_classes)
    else:
        print("✅ Classes are valid")

    print("\n🎯 TEST COMPLETE\n")


if __name__ == "__main__":
    test_notes_pipeline()