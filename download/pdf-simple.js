#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Check if --split flag is passed
const SPLIT_MODE = process.argv.includes('--split');

async function convert() {
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        console.error('Run: npm install puppeteer');
        process.exit(1);
    }

    const files = fs.readdirSync('.')
        .filter(f => f.startsWith('page-') && f.endsWith('.html'))
        .sort();

    if (!files.length) {
        console.error('No page-*.html files found');
        process.exit(1);
    }

    console.log(`Converting ${files.length} pages to PDF...`);
    console.log(`Mode: ${SPLIT_MODE ? 'Individual PDFs' : 'Single merged PDF'}`);

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-gpu'
        ],
        timeout: 30000
    });

    console.log('Creating new page...');
    const page = await browser.newPage();

    // Increase navigation timeout
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);

    if (SPLIT_MODE) {
        // Create individual PDF per HTML file
        const pdfs = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`Processing ${i + 1}/${files.length}: ${file}`);

            try {
                const content = fs.readFileSync(file, 'utf8');

                // Set viewport to A4 width in pixels (210mm = 794px at 96dpi)
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

                        // Calculate exact PDF dimensions based on image aspect ratio
                        // A4 width = 210mm, scale height proportionally
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
                    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
                });

                pdfs.push(pdfBuffer);
            } catch (error) {
                console.error(`Error processing ${file}:`, error.message);
            }
        }

        await browser.close();

        console.log('\nSaving individual PDFs...');
        pdfs.forEach((pdfBuffer, i) => {
            const filename = `book-page-${String(i + 1).padStart(3, '0')}.pdf`;
            fs.writeFileSync(filename, pdfBuffer);
        });

        const totalSize = pdfs.reduce((sum, buf) => sum + buf.length, 0);
        const sizeMB = (totalSize / 1024 / 1024).toFixed(2);

        console.log(`\n✅ Created ${pdfs.length} PDF files`);
        console.log(`📊 Total size: ${sizeMB} MB`);
        console.log('\n💡 To merge into one PDF:');
        console.log('   pdftk book-page-*.pdf cat output book.pdf');
        console.log('   or on macOS: "/System/Library/Automator/Combine PDF Pages.action/Contents/Resources/join.py" -o book.pdf book-page-*.pdf');

    } else {
        // Process pages individually and combine PDFs
        console.log('Processing pages individually...');

        const pdfs = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`Processing ${i + 1}/${files.length}: ${file}`);

            try {
                const content = fs.readFileSync(file, 'utf8');

                // Set viewport to A4 width in pixels (210mm = 794px at 96dpi)
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

                        // Calculate exact PDF dimensions based on image aspect ratio
                        // A4 width = 210mm, scale height proportionally
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
                    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
                });

                pdfs.push(pdfBuffer);

                // Clear page content to free memory (minimal HTML for speed)
                await page.setContent('<html><body></body></html>', { waitUntil: 'domcontentloaded' });

            } catch (error) {
                console.error(`Error processing ${file}:`, error.message);
            }
        }

        await browser.close();

        if (pdfs.length === 0) {
            console.error('No PDFs were generated!');
            process.exit(1);
        }

        // Merge PDFs using pdf-lib
        console.log('\nMerging PDFs...');

        let pdfLib;
        try {
            pdfLib = require('pdf-lib');
        } catch (e) {
            // Fallback: save individual PDFs
            console.log('pdf-lib not found, saving individual PDFs instead...');
            pdfs.forEach((pdfBuffer, i) => {
                const filename = `book-page-${String(i + 1).padStart(3, '0')}.pdf`;
                fs.writeFileSync(filename, pdfBuffer);
            });

            const totalSize = pdfs.reduce((sum, buf) => sum + buf.length, 0);
            const sizeMB = (totalSize / 1024 / 1024).toFixed(2);

            console.log(`\n✅ Created ${pdfs.length} PDF files`);
            console.log(`📊 Total size: ${sizeMB} MB`);
            console.log('\n💡 To merge into one PDF, run:');
            console.log('   npm install pdf-lib');
            console.log('   node pdf-simple.js');
            return;
        }

        const mergedPdf = await pdfLib.PDFDocument.create();

        for (let i = 0; i < pdfs.length; i++) {
            const pdfDoc = await pdfLib.PDFDocument.load(pdfs[i]);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        fs.writeFileSync('book.pdf', mergedPdfBytes);

        const sizeMB = (mergedPdfBytes.length / 1024 / 1024).toFixed(2);

        console.log(`\n✅ Created book.pdf`);
        console.log(`📊 Pages: ${files.length}`);
        console.log(`📊 Size: ${sizeMB} MB`);
    }
}

convert().catch(err => {
    console.error('\n❌ Error:', err.message);
    console.error('\nFull error:');
    console.error(err);
    console.error('\nTroubleshooting:');
    console.error('1. Try with --split flag: node pdf-simple.js --split');
    console.error('2. Check if Chromium is installed: npx puppeteer browsers install chrome');
    console.error('3. Try older puppeteer: npm install puppeteer@19.0.0');
    process.exit(1);
});
