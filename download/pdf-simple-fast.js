#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const os = require('os');
const crypto = require('crypto');

// Increase max listeners to avoid warnings with multiple browser instances
require('events').EventEmitter.defaultMaxListeners = 20;

// Number of parallel workers (use all CPU cores)
const NUM_WORKERS = os.cpus().length;

/**
 * Calculate MD5 hash of a file
 */
function getFileHash(filepath) {
    const content = fs.readFileSync(filepath);
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Remove duplicate HTML files based on content hash
 * Returns array of unique HTML files
 */
function deduplicateFiles(files) {
    console.log('🔍 Checking for duplicate pages...');

    const seen = new Map(); // hash -> first file with that hash
    const unique = [];
    const duplicates = [];

    files.forEach((file, index) => {
        const hash = getFileHash(file);

        if (seen.has(hash)) {
            const originalFile = seen.get(hash);
            duplicates.push({ file, duplicateOf: originalFile });
        } else {
            seen.set(hash, file);
            unique.push(file);
        }
    });

    console.log(`📊 Found ${files.length} HTML files`);
    console.log(`✅ Unique pages: ${unique.length}`);
    console.log(`🗑️  Duplicates removed: ${duplicates.length}`);

    if (duplicates.length > 0 && duplicates.length <= 20) {
        console.log('\n📋 Duplicate details:');
        duplicates.forEach(({ file, duplicateOf }) => {
            console.log(`   ${file} → ${duplicateOf}`);
        });
    }

    return unique;
}

async function convert() {
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        console.error('Run: npm install puppeteer');
        process.exit(1);
    }

    const allFiles = fs.readdirSync('.')
        .filter(f => f.startsWith('page-') && f.endsWith('.html'))
        .sort();

    if (!allFiles.length) {
        console.error('No page-*.html files found');
        process.exit(1);
    }

    // Deduplicate files before processing
    const files = deduplicateFiles(allFiles);

    console.log(`\nConverting ${files.length} pages to PDF...`);
    console.log(`Using ${NUM_WORKERS} parallel workers\n`);

    // Split files into batches for parallel processing
    const BATCH_SIZE = Math.ceil(files.length / NUM_WORKERS);
    const batches = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        batches.push(files.slice(i, i + BATCH_SIZE));
    }

    console.log('Launching browser instances...');

    // Process batches in parallel
    const startTime = Date.now();
    const results = await Promise.all(
        batches.map((batch, idx) => processBatch(batch, idx, puppeteer))
    );

    // Flatten results (each batch returns array of PDFs)
    const pdfs = results.flat();

    const processTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n⚡ Processed ${pdfs.length} pages in ${processTime}s`);

    // Merge PDFs using pdf-lib
    console.log('Merging PDFs...');

    let pdfLib;
    try {
        pdfLib = require('pdf-lib');
    } catch (e) {
        console.error('pdf-lib not found. Run: npm install pdf-lib');
        process.exit(1);
    }

    const mergedPdf = await pdfLib.PDFDocument.create();

    // Process in chunks to avoid memory issues
    const MERGE_CHUNK_SIZE = 100;
    for (let i = 0; i < pdfs.length; i += MERGE_CHUNK_SIZE) {
        const chunk = pdfs.slice(i, i + MERGE_CHUNK_SIZE);
        console.log(`Merging pages ${i + 1}-${Math.min(i + chunk.length, pdfs.length)}...`);

        for (const pdfBuffer of chunk) {
            const pdfDoc = await pdfLib.PDFDocument.load(pdfBuffer);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
    }

    console.log('Saving final PDF...');
    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync('book.pdf', mergedPdfBytes);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeMB = (mergedPdfBytes.length / 1024 / 1024).toFixed(2);

    console.log(`\n✅ Created book.pdf`);
    console.log(`📊 Pages: ${files.length}${allFiles.length !== files.length ? ` (${allFiles.length - files.length} duplicates removed)` : ''}`);
    console.log(`📊 Size: ${sizeMB} MB`);
    console.log(`⚡ Total time: ${totalTime}s`);
    console.log(`🚀 Speed: ${(files.length / totalTime).toFixed(1)} pages/sec`);
}

async function processBatch(files, workerId, puppeteer) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions'
        ],
        timeout: 30000
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    const pdfs = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const globalIdx = workerId * Math.ceil(1000 / NUM_WORKERS) + i + 1;

        // Progress indicator
        if (i % 10 === 0 || i === files.length - 1) {
            process.stdout.write(`\rWorker ${workerId + 1}: ${i + 1}/${files.length} pages`);
        }

        try {
            const content = fs.readFileSync(file, 'utf8');

            await page.setViewport({ width: 794, height: 1123 });

            await page.setContent(content, {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });

            // Get exact image dimensions
            const dimensions = await page.evaluate(() => {
                const img = document.querySelector('img');
                if (img && img.complete && img.naturalWidth > 0) {
                    const imgWidth = img.naturalWidth;
                    const imgHeight = img.naturalHeight;
                    const aspectRatio = imgHeight / imgWidth;
                    const heightMM = 210 * aspectRatio;
                    return { width: 210, height: heightMM };
                }
                return { width: 210, height: 297 };
            });

            const pdfBuffer = await page.pdf({
                width: `${dimensions.width}mm`,
                height: `${dimensions.height}mm`,
                printBackground: true,
                margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
                preferCSSPageSize: false,
                omitBackground: false
            });

            pdfs.push(pdfBuffer);

            // Clear page content to free memory
            await page.setContent('<html></html>', { waitUntil: 'domcontentloaded' });

        } catch (error) {
            console.error(`\nWorker ${workerId + 1}: Error processing ${file}:`, error.message);
        }
    }

    await browser.close();
    console.log(`\nWorker ${workerId + 1}: Completed ${pdfs.length} pages`);

    return pdfs;
}

convert().catch(err => {
    console.error('\n❌ Error:', err.message);
    console.error(err);
    process.exit(1);
});
