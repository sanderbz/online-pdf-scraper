# PadPilot Extractor → OCR PDF

Extract PadPilot pages to HTML and convert to **OCR searchable** PDF.

## Quick Start

```javascript
// 1. Open PadPilot in browser
// 2. Press F12 (Console)
// 3. Paste entire extractor.js
// 4. Run:
padpilotExtractor.start()
```

```bash
# 5. Move HTML files to download folder
mv page-*.html download/

# 6. Convert to PDF (image-based)
cd download
npm install  # First time only
npm run pdf  # Creates book.pdf

# 7. Add OCR layer (make it searchable)
npm run ocr  # Creates bookOCR.pdf
```

## What You Get

✅ **Clean visual** - Pure scanned images, no text overlays
✅ **OCR Searchable PDF** - Tesseract 5.x adds searchable text layer
✅ **Copy-paste works** - Extract text from OCR'd PDF
✅ **Proper A4 sizing** - Pages sized to actual image aspect ratio
✅ **One HTML per book page** - Each iframe extracted separately
✅ **Fast processing** - 5-10 pages/second

## How It Works

**Step 1: Extract images**
- Each iframe contains a scanned page as base64 image
- Extract ONLY the `<figure><img>` element
- No text overlays, no extra elements

**Step 2: Convert to PDF**
- Puppeteer renders each HTML page
- Page dimensions calculated from image aspect ratio
- Merge all pages into `book.pdf`

**Step 3: Add OCR layer**
- OCRmyPDF with Tesseract 5.x processes `book.pdf`
- Adds invisible searchable text layer
- Original images remain unchanged
- Result: `bookOCR.pdf` with full text search capability

## Extractor Commands

```javascript
padpilotExtractor.start()           // Extract pages
padpilotExtractor.stop()            // Stop
padpilotExtractor.downloadZip()     // Download all as ZIP (recommended for 10+ pages)
padpilotExtractor.downloadCurrent() // Current only
padpilotExtractor.setDelay(1000)    // Speed (ms, default 1000)
```

## PDF Conversion

```bash
cd download

# Convert HTML to PDF (image-based)
npm run pdf      # Creates book.pdf

# Add OCR layer for searchability
npm run ocr      # Creates bookOCR.pdf
```

**Requirements:**
- `puppeteer` and `pdf-lib` (installed via `npm install`)
- `ocrmypdf` (install via `brew install ocrmypdf` on macOS)

## Files

```
padpilot/
├── extractor.js          # Browser extraction script
├── download/
│   ├── pdf-simple.js     # HTML → PDF converter
│   ├── ocr.js            # PDF → OCR PDF converter
│   ├── package.json      # Dependencies
│   ├── page-*.html       # Extracted pages
│   ├── book.pdf          # Image-based PDF
│   └── bookOCR.pdf       # Searchable OCR PDF
└── README.md
```

## FAQ

**Q: Will PDF be searchable?**
A: Yes! Run `npm run ocr` to add OCR text layer using Tesseract 5.x.

**Q: Can I copy text from the PDF?**
A: Yes, after running OCR conversion the text is searchable and copy-able.

**Q: How accurate is the OCR?**
A: Tesseract 5.x is excellent for technical English. For aviation/technical documents it handles abbreviations, codes, and technical terminology well.

**Q: How many HTML files will I get?**
A: One HTML file per actual book page. PadPilot shows multiple pages at once in split-screen, and each iframe is saved separately.

**Q: How long does OCR take?**
A: OCRmyPDF processes multiple pages in parallel (4 workers by default). Speed depends on page count and image quality.

**Q: Do I need the HTML files after PDF conversion?**
A: No, you can delete them. Keep only `bookOCR.pdf`.

## Browser Shortcuts

- Chrome: `Ctrl+Shift+J` (Win) / `Cmd+Option+J` (Mac)
- Firefox: `Ctrl+Shift+K` (Win) / `Cmd+Option+K` (Mac)
- Safari: `Cmd+Option+C`
