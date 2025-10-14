# PadPilot Extractor → OCR PDF

Extract PadPilot pages to searchable PDFs with automatic duplicate detection and LLM optimization.

## Quick Start

```javascript
// 1. Browser: F12 Console, paste extractor.js
padpilotExtractor.start()
padpilotExtractor.downloadZip()
```

```bash
# 2. Place ZIP in download/input/
cd download
npm install
node batch-handler.js --llm
```

## Features

- **Auto-deduplication** - Removes 60% duplicate pages typical
- **Parallel processing** - 12-15 pages/sec using all CPU cores
- **Batch processing** - Process multiple books automatically
- **OCR searchable** - Full text search with Tesseract
- **LLM-optimized** - 20-30x compression (155MB → 5-7MB)
- **Progress tracking** - Resume from interruptions

## Batch Processing (Recommended)

```bash
# Place ZIPs in download/input/, then:
node batch-handler.js        # Generates: book.pdf, book-ocr.pdf
node batch-handler.js --llm  # Also: book-llm.pdf (compressed)
```

Automatically extracts HTML, removes duplicates, generates PDFs, adds OCR, and tracks progress.

## Manual Processing

```bash
cd download

node pdf-simple-fast.js      # HTML → book.pdf (deduplicated)
node ocr.js                  # book.pdf → bookOCR.pdf (searchable)
node ocr-to-llm-pdf.js       # Batch convert *-ocr.pdf → *-llm.pdf
```

## Performance

- **Deduplication**: 1004 pages → 397 unique (607 duplicates removed) in ~30s
- **LLM Compression**: 155 MB → 5-7 MB (20-30x), preserves OCR text layer
- **Parallel**: 10+ PDF workers, 16 OCR jobs, 10+ LLM workers

## Requirements

```bash
npm install puppeteer pdf-lib adm-zip
brew install ocrmypdf ghostscript
```

## Files

```
padpilot/
├── extractor.js              # Browser extraction
├── download/
│   ├── input/                # Place ZIPs here
│   ├── batch-handler.js      # Main processor
│   ├── pdf-simple-fast.js    # PDF generator (dedup)
│   ├── ocr.js                # OCR processor
│   └── ocr-to-llm-pdf.js     # LLM compressor
```
