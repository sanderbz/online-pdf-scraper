const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

async function addOCRtoPDF() {
    console.log('🔍 Starting OCR conversion...');

    // Parse command line arguments
    const args = process.argv.slice(2);
    let maxPages = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--pages' && args[i + 1]) {
            maxPages = parseInt(args[i + 1]);
            if (isNaN(maxPages) || maxPages < 1) {
                console.error('❌ Error: --pages must be a positive number');
                process.exit(1);
            }
            console.log(`📄 Limiting to first ${maxPages} pages for testing\n`);
            break;
        }
    }

    const inputPDF = 'book.pdf';
    const outputPDF = 'bookOCR.pdf';

    // Check if input file exists
    if (!fs.existsSync(inputPDF)) {
        console.error(`❌ Error: ${inputPDF} not found!`);
        console.log('Please run "npm run pdf" first to create book.pdf');
        process.exit(1);
    }

    // Check if ocrmypdf is installed
    if (!fs.existsSync('/opt/homebrew/bin/ocrmypdf') && !fs.existsSync('/usr/local/bin/ocrmypdf')) {
        console.error('❌ Error: ocrmypdf is not installed!');
        console.log('\nInstall instructions:');
        console.log('  macOS:   brew install ocrmypdf');
        console.log('  Ubuntu:  sudo apt-get install ocrmypdf');
        console.log('  Other:   pip install ocrmypdf');
        process.exit(1);
    }

    console.log('📄 Processing book.pdf with OCR...');
    console.log('⏳ Progress will be shown below...\n');

    return new Promise((resolve, reject) => {
        // Run ocrmypdf with verbose output to show progress
        // Performance optimizations for M2 Max (12 cores):
        // --jobs 12: Use all 12 CPU cores for maximum parallelism
        // --tesseract-oem 1: Use LSTM neural net only (fastest, most accurate)
        // --optimize 0: Skip optimization for speed (can optimize later if needed)
        // --output-type pdf: Skip PDF/A conversion (MUCH faster, still fully searchable)
        // --tesseract-timeout: Prevent hanging on difficult pages
        const ocrArgs = [
            '--force-ocr',
            '--jobs', '16',  // More jobs than cores (leverage hyperthreading/IO wait)
            '--tesseract-oem', '1',  // LSTM only (fastest engine)
            '--optimize', '0',  // Skip optimization for speed
            '--output-type', 'pdf',  // Regular PDF (not PDF/A) - much faster!
            '--tesseract-timeout', '60',  // 1 min timeout per page
            '--pdf-renderer', 'sandwich',  // Fastest renderer (skips HOCR intermediate format)
            '-v', '1',  // Verbose level 1 shows page progress
        ];

        // Add page limit if specified
        if (maxPages) {
            ocrArgs.push('--pages', `1-${maxPages}`);
        }

        ocrArgs.push(inputPDF, outputPDF);

        const ocr = spawn('ocrmypdf', ocrArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let processedPages = 0;
        let lastOutput = Date.now();
        let isFinalizingStage = false;

        // Heartbeat to show process is still alive
        const heartbeatInterval = setInterval(() => {
            const timeSinceLastOutput = Date.now() - lastOutput;

            // If no output for 1 minute, show we're still working
            if (timeSinceLastOutput > 60000) {
                if (isFinalizingStage) {
                    console.log('\n⏳ Still finalizing PDF... (merging all pages, please wait)');
                } else {
                    console.log('\n⏳ Still processing... (OCR in progress)');
                }
                lastOutput = Date.now(); // Reset to avoid spamming
            }
        }, 30000); // Check every 30 seconds

        // Capture stdout (progress info)
        ocr.stdout.on('data', (data) => {
            const output = data.toString();
            lastOutput = Date.now();
            process.stdout.write(output);
        });

        // Capture stderr (status and progress messages)
        ocr.stderr.on('data', (data) => {
            const output = data.toString();
            lastOutput = Date.now();

            // Detect final stages (Ghostscript merging/finalizing)
            if (output.includes('pdfwrite') || output.includes('fix_docinfo') || output.includes('Postprocessing')) {
                if (!isFinalizingStage) {
                    console.log('\n\n📦 Finalizing PDF (merging all OCR layers)... this takes time for large files');
                    isFinalizingStage = true;
                }
            }

            // Count pages being processed
            if (output.includes('Start processing') || output.includes('Processing page')) {
                processedPages++;
                process.stdout.write(`\r📄 Processing page ${processedPages}...`);
            } else if (output.includes('INFO') || output.includes('WARNING') || output.includes('ERROR')) {
                // Show info/warning/error messages on new line
                process.stdout.write('\n' + output);
            }
        });

        ocr.on('close', (code) => {
            clearInterval(heartbeatInterval);

            if (code === 0) {
                // Check if output file was created
                if (fs.existsSync(outputPDF)) {
                    const stats = fs.statSync(outputPDF);
                    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                    console.log(`\n✅ Success! Created ${outputPDF} (${sizeMB} MB)`);
                    console.log('📝 The PDF now has a searchable text layer!');
                    resolve();
                } else {
                    console.error('❌ Error: Output file was not created');
                    reject(new Error('Output file not created'));
                }
            } else {
                console.error(`❌ OCR process exited with code ${code}`);
                reject(new Error(`OCR failed with code ${code}`));
            }
        });

        ocr.on('error', (error) => {
            clearInterval(heartbeatInterval);
            console.error('❌ Failed to start OCR process:', error.message);
            reject(error);
        });
    });
}

// Run the OCR conversion
addOCRtoPDF().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
