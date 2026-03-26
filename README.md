# Financial Analysis AI

This project is a financial analysis tool that uses AI to process and analyze financial documents. It can extract data from PDF documents, classify financial data, and generate reports.

## Project Structure

```
backend/
├── ai_core_service/
│   ├── agents/
│   ├── api/
│   ├── config/
│   ├── data/
│   ├── database/
│   ├── financial_engine/
│   ├── indexing/
│   ├── infrastructure/
│   ├── llm/
│   ├── prompts/
│   ├── rag/
│   ├── retrieval/
│   ├── scripts/
│   ├── main.py
│   └── test.py
└── frontend/
```

## File Explanations

### Backend (`/backend/ai_core_service/`)

*   **`test.py`**: Contains test cases for the AI core 
*   **`config/`**: Contains the configuration files for the AI core service.
    *   **`constants.py`**: This file acts as a central repository for all the fixed values and configurations used across the project. It defines `NOTES_ARTICLE_PATTERNS` (a list of regular expressions used to identify and extract articles from accounting notes), `YEAR_RANGE` (a predefined range of years used to filter out irrelevant numbers that might be mistaken for financial data), and `VALID_CLASSES` (a set of valid accounting classes that helps in classifying financial data).
*   **`data/`**: Contains the data used by the AI core service.

*   **`financial_engine/`**: Contains the financial engine that performs the financial analysis.

*   **`infrastructure/`**: Contains the infrastructure files, such as document parsers and chunkers.
    *   **`document_management/`**: This directory is the foundation of the data processing pipeline, responsible for ingesting, parsing, and structuring financial documents before they are used by the AI.
        *   **`doc_router.py`**: Acts as the initial entry point for document processing. It examines the content of a document and determines its type—such as a balance sheet, income statement, or accounting notes. This classification is crucial because it dictates which parsing logic will be applied.
        *   **`pdf_parser.py`**: Responsible for extracting raw text from PDF files. It is designed to handle different document structures, ensuring that the text is accurately extracted and prepared for further processing.
        *   **`notes_parser.py`**: Specializes in parsing accounting notes, which often have a unique structure with articles, sections, and specific financial terminology. This parser identifies and separates these components, making the data more organized and meaningful.
        *   **`chunker.py`**: Takes large blocks of text and breaks them into smaller, fixed-size chunks. This is essential for feeding the data into language models, which have limitations on input size. By creating manageable pieces, it ensures that no information is lost during analysis.
        *   **`models.py`**: Defines the data structures, or "shapes," that the processed data will take. It ensures that the output from the parsers and chunker is consistent and predictable, which is critical for the reliability of the entire system.
*   **`llm/`**: Contains the files related to the language model.
*   **`prompts/`**: Contains the prompts used by the language model.
*   **`rag/`**: Contains the files related to the Retrieval-Augmented Generation (RAG) system.
*   **`retrieval/`**: Contains the files related to document retrieval.
*   **`scripts/`**: Contains various scripts for the project.

### Frontend (`/frontend/`)

*   This directory contains the frontend code for the project.
