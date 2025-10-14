# PadPilot Extractor → Searchable PDF

Extract PadPilot pages to HTML and convert to **searchable** PDF.

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

# 6. Convert to PDF
cd download
npm install puppeteer  # First time only
node pdf-simple.js     # Creates book.pdf
```

## What You Get

✅ **Clean visual** - No weird concatenated text visible
✅ **Searchable PDF** - Text overlay preserved (transparent)
✅ **Copy-paste works** - Select text in browser/PDF
✅ **Proper A4 sizing** - 210mm × 297mm pages
✅ **One HTML per book page** - Each iframe extracted separately

## How It Works

**The Magic:**
- **Image layer** - Scanned page (visible)
- **Text layer** - Invisible overlay (for searching)
- **Result** - Clean look + full searchability

**CSS trick:**
```css
.ps.pr.op.co {
    color: transparent !important;  /* Hide visually */
    position: absolute !important;   /* Keep positioned */
    user-select: text;              /* Allow selection */
}
```

Text is there, just invisible!

## PDF Searchability Confirmed

The PDF converter (`pdf-simple.js`) preserves the text overlay.
Test: Open PDF → Search for "About this Book" → Works!

## Commands

```javascript
padpilotExtractor.start()           // Extract pages
padpilotExtractor.stop()            // Stop
padpilotExtractor.downloadData()    // Download all
padpilotExtractor.downloadCurrent() // Current only
padpilotExtractor.setDelay(1000)    // Speed (ms)
```

## Convert to PDF

**Default: Single merged PDF**
```bash
cd download
node pdf-simple.js     # Creates book.pdf
```

**Alternative: Individual PDFs (if memory issues)**
```bash
node pdf-simple.js --split     # Creates book-page-001.pdf, book-page-002.pdf, etc.
# Then merge with:
pdftk book-page-*.pdf cat output book.pdf
```

PDF will be:
- ✅ Searchable
- ✅ Proper page size (A4)
- ✅ Each HTML page = one PDF page
- ✅ Smaller than HTML files (~20MB vs 100MB+)

## Files

```
padpilot/
├── extractor.js          # Main script
├── download/
│   ├── pdf-simple.js     # PDF converter
│   ├── page-*.html       # Extracted pages
│   └── book.pdf          # Final PDF
└── README.md
```

## FAQ

**Q: Will PDF be searchable?**
A: Yes! Text overlay is transparent but preserved.

**Q: Can I copy text?**
A: Yes, in both HTML and PDF.

**Q: Why hide the text overlay?**
A: Text has no spaces ("wordswithoutspaces"), but it's searchable when transparent.

**Q: Does it work like the original?**
A: Yes! Same functionality, cleaner visual.

**Q: How many HTML files will I get?**
A: One HTML file per actual book page. PadPilot shows multiple pages at once (5-7 iframes), and each iframe is now saved separately.

**Q: What if PDF conversion crashes?**
A: Use `--split` flag to create individual PDFs, then merge them.

## Browser Shortcuts

- Chrome: `Ctrl+Shift+J` (Win) / `Cmd+Option+J` (Mac)
- Firefox: `Ctrl+Shift+K` (Win) / `Cmd+Option+K` (Mac)
- Safari: `Cmd+Option+C`
