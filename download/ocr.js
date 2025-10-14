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
        // --jobs: Use all CPU cores for parallel processing
        // --optimize 0: Skip optimization for speed (can optimize later if needed)
        const ocrArgs = [
            '--force-ocr',
            '--rotate-pages',
            '--jobs', '8',  // Use 8 parallel workers (faster)
            '--optimize', '0',  // Skip optimization for speed
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

        // Capture stdout (progress info)
        ocr.stdout.on('data', (data) => {
            const output = data.toString();
            process.stdout.write(output);
        });

        // Capture stderr (status and progress messages)
        ocr.stderr.on('data', (data) => {
            const output = data.toString();

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
