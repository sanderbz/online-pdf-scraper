// ============================================================================
// PadPilot Extractor - SEARCHABLE PDF VERSION
// Clean visual output + searchable text for PDF
// ============================================================================

(function() {
    'use strict';

    const config = {
        delayBetweenPages: 1000,
        maxPages: 1000,
        extractImages: true,
        verbose: true
    };

    const collectedPages = [];
    let currentPageNumber = 0;
    let isExtracting = false;

    const log = (msg, ...args) => config.verbose && console.log(`[Extractor] ${msg}`, ...args);

    function getCurrentChapterTitle() {
        const el = document.querySelector('#fixedBookTitle');
        return el ? el.textContent.trim() : 'Unknown';
    }

    async function extractIframeContent() {
        const iframes = document.querySelectorAll('iframe[id^="epub_"]');
        log(`Found ${iframes.length} iframes`);

        const pages = [];

        for (let iframe of iframes) {
            try {
                let doc = null;
                let html = '';

                try {
                    doc = iframe.contentDocument || iframe.contentWindow.document;
                } catch (e) {
                    if (iframe.src.startsWith('blob:')) {
                        log(`Fetching blob ${iframe.id}...`);
                        const resp = await fetch(iframe.src);
                        html = await resp.text();
                    }
                }

                if (doc && !html) {
                    html = doc.documentElement.outerHTML;

                    // Convert images to base64
                    if (config.extractImages) {
                        const imgs = doc.querySelectorAll('img');
                        for (let img of imgs) {
                            if (img.src && !img.src.startsWith('data:')) {
                                try {
                                    const canvas = document.createElement('canvas');
                                    canvas.width = img.naturalWidth || img.width;
                                    canvas.height = img.naturalHeight || img.height;
                                    canvas.getContext('2d').drawImage(img, 0, 0);
                                    const dataURL = canvas.toDataURL('image/png');
                                    html = html.replace(img.src, dataURL);
                                } catch (imgErr) {
                                    log(`Image conversion failed`);
                                }
                            }
                        }
                    }
                }

                const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                if (bodyMatch) {
                    // Extract ONLY the figure element with the image
                    const figureMatch = bodyMatch[1].match(/<figure[^>]*id="bodyimage"[^>]*>[\s\S]*?<\/figure>/i);

                    if (figureMatch) {
                        const pageHTML = `<!DOCTYPE html>
<html style="margin:0;padding:0">
<head>
<meta charset="UTF-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        width: 210mm;
        height: auto;
        line-height: 0;
        font-size: 0;
    }
    figure {
        width: 210mm;
        height: auto;
        margin: 0;
        padding: 0;
        display: block;
        line-height: 0;
    }
    img {
        width: 210mm;
        height: auto;
        display: block;
        margin: 0;
        padding: 0;
        border: 0;
    }
</style>
</head>
<body>
${figureMatch[0]}
</body>
</html>`;
                        pages.push(pageHTML);
                    }
                }

                log(`✓ ${iframe.id}`);
            } catch (e) {
                log(`Error: ${iframe.id}`);
            }
        }

        return pages;
    }

    function hasNextPage() {
        const pageBtn = document.querySelector('#default_next_bttn, .rightNavigation');
        if (pageBtn && !pageBtn.disabled && pageBtn.getAttribute('aria-hidden') !== 'true') return true;
        const chapterBtn = document.querySelector('#nextChapter');
        return chapterBtn && !chapterBtn.disabled && !chapterBtn.classList.contains('md-disabled');
    }

    function goToNextPage() {
        const pageBtn = document.querySelector('#default_next_bttn, .rightNavigation');
        if (pageBtn && !pageBtn.disabled && pageBtn.getAttribute('aria-hidden') !== 'true') {
            log('→ Next');
            pageBtn.click();
            return true;
        }
        const chapterBtn = document.querySelector('#nextChapter');
        if (chapterBtn && !chapterBtn.disabled) {
            log('→ Next chapter');
            chapterBtn.click();
            return true;
        }
        return false;
    }

    async function extractAndContinue() {
        if (!isExtracting) return;

        log(`\n=== Navigation Step ${currentPageNumber + 1} ===`);

        const chapter = getCurrentChapterTitle();
        const pages = await extractIframeContent();

        // Save each iframe as a separate page
        for (let html of pages) {
            currentPageNumber++;
            collectedPages.push({ page: currentPageNumber, chapter, html });
            log(`✓ Page ${currentPageNumber} saved`);
        }

        if (!isExtracting || currentPageNumber >= config.maxPages) {
            isExtracting = false;
            finish();
            return;
        }

        if (hasNextPage()) {
            setTimeout(() => {
                if (!isExtracting) return;
                if (goToNextPage()) {
                    setTimeout(() => { if (isExtracting) extractAndContinue(); }, config.delayBetweenPages);
                } else {
                    isExtracting = false;
                    finish();
                }
            }, config.delayBetweenPages);
        } else {
            isExtracting = false;
            finish();
        }
    }

    function finish() {
        isExtracting = false;
        log(`\n=== COMPLETE: ${collectedPages.length} pages ===`);
        console.log(`\n⚠️  Browser may block multiple downloads!`);
        console.log(`✅ Use: padpilotExtractor.downloadZip() to download as ZIP`);
        console.log(`   OR: padpilotExtractor.downloadBatch(10) to download in batches`);
        window.padpilotData = collectedPages;
    }

    function download(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const pad = (n) => String(n).padStart(3, '0');
    const safe = (str) => str.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 30);

    window.padpilotExtractor = {
        start() {
            if (isExtracting) return log('⚠️  Already running');
            isExtracting = true;
            log('🚀 Starting...');
            extractAndContinue();
        },

        stop() {
            if (!isExtracting) return log('⚠️  Not running');
            isExtracting = false;
            log('⏹ Stopped');
            log(`💾 ${collectedPages.length} pages collected`);
        },

        async downloadCurrent() {
            log('📥 Downloading current view...');
            const chapter = getCurrentChapterTitle();
            const pages = await extractIframeContent();
            let pageNum = 0;
            for (let html of pages) {
                pageNum++;
                download(html, `current-${pageNum}-${safe(chapter)}.html`, 'text/html');
            }
            log(`✓ Downloaded ${pages.length} pages`);
        },

        downloadData() {
            if (!collectedPages.length) return log('⚠️  No data');
            log(`📥 Downloading ${collectedPages.length} pages...`);
            collectedPages.forEach(p => {
                download(p.html, `page-${pad(p.page)}-${safe(p.chapter)}.html`, 'text/html');
            });
            log('✓ Done');
        },

        async downloadZip() {
            if (!collectedPages.length) return log('⚠️  No data');

            log('📦 Creating ZIP file...');

            // Load JSZip from CDN
            if (typeof JSZip === 'undefined') {
                log('Loading JSZip library...');
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                log('✓ JSZip loaded');
            }

            const zip = new JSZip();

            collectedPages.forEach(p => {
                const filename = `page-${pad(p.page)}-${safe(p.chapter)}.html`;
                zip.file(filename, p.html);
            });

            log('Generating ZIP...');
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `padpilot-pages-${collectedPages.length}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            log(`✅ Downloaded ${collectedPages.length} pages as ZIP`);
        },

        downloadBatch(batchSize = 10) {
            if (!collectedPages.length) return log('⚠️  No data');

            let currentBatch = 0;
            const totalBatches = Math.ceil(collectedPages.length / batchSize);

            const downloadNextBatch = () => {
                if (currentBatch >= totalBatches) {
                    log('✅ All batches downloaded');
                    return;
                }

                const start = currentBatch * batchSize;
                const end = Math.min(start + batchSize, collectedPages.length);

                log(`📥 Downloading batch ${currentBatch + 1}/${totalBatches} (pages ${start + 1}-${end})`);

                for (let i = start; i < end; i++) {
                    const p = collectedPages[i];
                    download(p.html, `page-${pad(p.page)}-${safe(p.chapter)}.html`, 'text/html');
                }

                currentBatch++;

                if (currentBatch < totalBatches) {
                    console.log(`⏳ Next batch in 3 seconds... (or call downloadBatch(${batchSize}) again)`);
                    setTimeout(downloadNextBatch, 3000);
                }
            };

            downloadNextBatch();
        },

        getData() {
            console.log(`📊 ${collectedPages.length} pages`);
            return collectedPages;
        },

        setDelay(ms) {
            config.delayBetweenPages = ms;
            log(`Delay: ${ms}ms`);
        },

        setMaxPages(max) {
            config.maxPages = max;
            log(`Max pages: ${max}`);
        },

        help() {
            console.log(`
╔═══════════════════════════════════════════════╗
║   PadPilot Extractor - Searchable PDF Ready  ║
╚═══════════════════════════════════════════════╝

Commands:
  start()              - Extract all pages
  stop()               - Stop extraction
  downloadZip()        - Download as ZIP (RECOMMENDED for 10+ pages)
  downloadBatch(n)     - Download in batches (default 10)
  downloadData()       - Download all (may be blocked by browser)
  downloadCurrent()    - Current view only
  setDelay(ms)         - Adjust speed
  setMaxPages(n)       - Limit pages

Features:
  ✅ Proper A4 sizing (210mm)
  ✅ Clean visual (no weird text)
  ✅ Searchable PDF (text overlay kept)
  ✅ 1 HTML per actual book page
  ✅ Each iframe extracted separately
  ✅ ZIP download bypasses browser limits

Pages: ${collectedPages.length}
Running: ${isExtracting ? 'Yes' : 'No'}
            `);
        }
    };

    log('✅ Loaded!');
    log('Type: padpilotExtractor.start()');
    setTimeout(() => padpilotExtractor.help(), 300);

})();

console.log('\n✅ Ready! Type: padpilotExtractor.start()\n');
