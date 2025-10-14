#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

// Parse command line arguments
const GENERATE_LLM = process.argv.includes('--llm');

// Configuration
const INPUT_DIR = path.join(__dirname, 'input');
const OUTPUT_DIR = __dirname;
const TEMP_DIR = path.join(__dirname, '.temp');
const PROGRESS_FILE = path.join(__dirname, '.batch-progress.json');

// Ensure directories exist
if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
    console.log(`📁 Created input directory: ${INPUT_DIR}`);
    console.log('👉 Place your .zip files in download/input/');
    process.exit(0);
}

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Load progress tracking data
 */
function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        } catch (e) {
            console.warn('⚠️  Warning: Could not read progress file, starting fresh');
            return {};
        }
    }
    return {};
}

/**
 * Save progress tracking data
 */
function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Get status of a job
 */
function getJobStatus(progress, zipName) {
    return progress[zipName] || { status: 'pending', pdf: false, ocr: false, llm: false };
}

/**
 * Update job status
 */
function updateJobStatus(progress, zipName, updates) {
    if (!progress[zipName]) {
        progress[zipName] = { status: 'pending', pdf: false, ocr: false, llm: false };
    }
    Object.assign(progress[zipName], updates);
    saveProgress(progress);
}

/**
 * Extract ZIP file to temporary directory
 */
function extractZip(zipPath, extractPath) {
    console.log(`\n📦 Extracting ${path.basename(zipPath)}...`);

    try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractPath, true);

        // Count HTML files
        const htmlFiles = fs.readdirSync(extractPath)
            .filter(f => f.endsWith('.html'));

        console.log(`✅ Extracted ${htmlFiles.length} HTML files`);
        return htmlFiles.length;
    } catch (error) {
        throw new Error(`Failed to extract ZIP: ${error.message}`);
    }
}

/**
 * Run a command and stream its output
 */
function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`\n▶️  Running: ${command} ${args.join(' ')}`);

        const proc = spawn(command, args, {
            cwd: options.cwd || process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            process.stdout.write(output);
        });

        proc.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            process.stderr.write(output);
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Command failed with exit code ${code}\nStderr: ${stderr}`));
            }
        });

        proc.on('error', (error) => {
            reject(new Error(`Failed to start command: ${error.message}`));
        });
    });
}

/**
 * Generate PDF from HTML files using pdf-simple-fast.js
 */
async function generatePDF(extractPath, outputPath) {
    console.log(`\n📄 Generating PDF with deduplication...`);

    const pdfScriptPath = path.join(__dirname, 'pdf-simple-fast.js');

    if (!fs.existsSync(pdfScriptPath)) {
        throw new Error('pdf-simple-fast.js not found!');
    }

    try {
        await runCommand('node', [pdfScriptPath], { cwd: extractPath });

        // Move generated book.pdf to output location
        const generatedPdf = path.join(extractPath, 'book.pdf');

        if (!fs.existsSync(generatedPdf)) {
            throw new Error('book.pdf was not created');
        }

        fs.renameSync(generatedPdf, outputPath);

        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`✅ PDF created: ${path.basename(outputPath)} (${sizeMB} MB)`);
        return outputPath;
    } catch (error) {
        throw new Error(`PDF generation failed: ${error.message}`);
    }
}

/**
 * Generate OCR PDF using ocr.js
 */
async function generateOCR(pdfPath, ocrOutputPath) {
    console.log(`\n🔍 Adding OCR layer to PDF...`);

    const ocrScriptPath = path.join(__dirname, 'ocr.js');

    if (!fs.existsSync(ocrScriptPath)) {
        throw new Error('ocr.js not found!');
    }

    // Create a temporary directory for OCR processing
    const ocrTempDir = path.join(TEMP_DIR, `ocr-${Date.now()}`);
    fs.mkdirSync(ocrTempDir, { recursive: true });

    try {
        // Copy input PDF to temp dir as book.pdf (expected by ocr.js)
        const tempInputPdf = path.join(ocrTempDir, 'book.pdf');
        fs.copyFileSync(pdfPath, tempInputPdf);

        // Run OCR script in temp directory
        await runCommand('node', [ocrScriptPath], { cwd: ocrTempDir });

        // Move generated bookOCR.pdf to output location
        const generatedOcrPdf = path.join(ocrTempDir, 'bookOCR.pdf');

        if (!fs.existsSync(generatedOcrPdf)) {
            throw new Error('bookOCR.pdf was not created');
        }

        fs.renameSync(generatedOcrPdf, ocrOutputPath);

        const stats = fs.statSync(ocrOutputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`✅ OCR PDF created: ${path.basename(ocrOutputPath)} (${sizeMB} MB)`);

        // Cleanup temp directory
        fs.rmSync(ocrTempDir, { recursive: true, force: true });

        return ocrOutputPath;
    } catch (error) {
        // Cleanup on error
        if (fs.existsSync(ocrTempDir)) {
            fs.rmSync(ocrTempDir, { recursive: true, force: true });
        }
        throw new Error(`OCR generation failed: ${error.message}`);
    }
}

/**
 * Generate LLM-friendly PDF using ocr-to-llm-pdf.js
 */
async function generateLLM(ocrPdfPath, llmOutputPath) {
    console.log(`\n📚 Generating LLM-friendly PDF...`);

    const llmScriptPath = path.join(__dirname, 'ocr-to-llm-pdf.js');

    if (!fs.existsSync(llmScriptPath)) {
        throw new Error('ocr-to-llm-pdf.js not found!');
    }

    try {
        await runCommand('node', [llmScriptPath, ocrPdfPath, llmOutputPath]);

        if (!fs.existsSync(llmOutputPath)) {
            throw new Error('LLM PDF was not created');
        }

        const stats = fs.statSync(llmOutputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`✅ LLM PDF created: ${path.basename(llmOutputPath)} (${sizeMB} MB)`);

        return llmOutputPath;
    } catch (error) {
        throw new Error(`LLM PDF generation failed: ${error.message}`);
    }
}

/**
 * Process a single ZIP file
 */
async function processZip(zipPath, progress) {
    const zipName = path.basename(zipPath);
    const baseName = zipName.replace(/\.zip$/i, '');

    const pdfOutputPath = path.join(OUTPUT_DIR, `${baseName}.pdf`);
    const ocrOutputPath = path.join(OUTPUT_DIR, `${baseName}-ocr.pdf`);
    const llmOutputPath = path.join(OUTPUT_DIR, `${baseName}-llm.pdf`);

    console.log('\n' + '='.repeat(80));
    console.log(`📚 Processing: ${zipName}`);
    console.log('='.repeat(80));

    const jobStatus = getJobStatus(progress, zipName);

    // Check if already completed
    const pdfExists = jobStatus.pdf && fs.existsSync(pdfOutputPath);
    const ocrExists = jobStatus.ocr && fs.existsSync(ocrOutputPath);
    const llmExists = jobStatus.llm && fs.existsSync(llmOutputPath);

    if (pdfExists && ocrExists && (!GENERATE_LLM || llmExists)) {
        console.log(`✅ Already completed`);
        console.log(`   PDF: ${baseName}.pdf`);
        console.log(`   OCR: ${baseName}-ocr.pdf`);
        if (GENERATE_LLM && llmExists) {
            console.log(`   LLM: ${baseName}-llm.pdf`);
        }
        return;
    }

    updateJobStatus(progress, zipName, { status: 'processing', startedAt: new Date().toISOString() });

    // Create extraction directory
    const extractPath = path.join(TEMP_DIR, baseName);

    try {
        // Clean up extraction directory if it exists
        if (fs.existsSync(extractPath)) {
            fs.rmSync(extractPath, { recursive: true, force: true });
        }
        fs.mkdirSync(extractPath, { recursive: true });

        // Step 1: Extract ZIP
        const htmlCount = extractZip(zipPath, extractPath);

        if (htmlCount === 0) {
            throw new Error('No HTML files found in ZIP');
        }

        // Step 2: Generate PDF (if not already done)
        if (!jobStatus.pdf || !fs.existsSync(pdfOutputPath)) {
            await generatePDF(extractPath, pdfOutputPath);
            updateJobStatus(progress, zipName, { pdf: true, pdfCreatedAt: new Date().toISOString() });
        } else {
            console.log(`✅ PDF already exists, skipping: ${baseName}.pdf`);
        }

        // Step 3: Generate OCR PDF (if not already done)
        if (!jobStatus.ocr || !fs.existsSync(ocrOutputPath)) {
            await generateOCR(pdfOutputPath, ocrOutputPath);
            updateJobStatus(progress, zipName, { ocr: true, ocrCreatedAt: new Date().toISOString() });
        } else {
            console.log(`✅ OCR PDF already exists, skipping: ${baseName}-ocr.pdf`);
        }

        // Step 4: Generate LLM-friendly PDF (if --llm flag is set)
        if (GENERATE_LLM) {
            if (!jobStatus.llm || !fs.existsSync(llmOutputPath)) {
                await generateLLM(ocrOutputPath, llmOutputPath);
                updateJobStatus(progress, zipName, { llm: true, llmCreatedAt: new Date().toISOString() });
            } else {
                console.log(`✅ LLM PDF already exists, skipping: ${baseName}-llm.pdf`);
            }
        }

        // Mark as completed
        updateJobStatus(progress, zipName, {
            status: 'completed',
            completedAt: new Date().toISOString()
        });

        console.log(`\n✅ Successfully processed ${zipName}`);
        console.log(`   📄 PDF: ${baseName}.pdf`);
        console.log(`   🔍 OCR: ${baseName}-ocr.pdf`);
        if (GENERATE_LLM) {
            console.log(`   📚 LLM: ${baseName}-llm.pdf`);
        }

    } catch (error) {
        console.error(`\n❌ Error processing ${zipName}:`, error.message);
        updateJobStatus(progress, zipName, {
            status: 'failed',
            error: error.message,
            failedAt: new Date().toISOString()
        });
        throw error;
    } finally {
        // Cleanup extraction directory
        if (fs.existsSync(extractPath)) {
            console.log(`\n🧹 Cleaning up temporary files...`);
            fs.rmSync(extractPath, { recursive: true, force: true });
        }
    }
}

/**
 * Main batch processing function
 */
async function processBatch() {
    console.log('\n🚀 Batch PDF & OCR Processor');
    console.log('='.repeat(80));
    if (GENERATE_LLM) {
        console.log('📚 LLM-friendly PDF generation: ENABLED');
    }

    // Check for required dependencies
    console.log('\n🔍 Checking dependencies...');

    try {
        require('adm-zip');
        console.log('✅ adm-zip installed');
    } catch (e) {
        console.error('❌ adm-zip not installed. Run: npm install adm-zip');
        process.exit(1);
    }

    try {
        require('puppeteer');
        console.log('✅ puppeteer installed');
    } catch (e) {
        console.error('❌ puppeteer not installed. Run: npm install puppeteer');
        process.exit(1);
    }

    try {
        require('pdf-lib');
        console.log('✅ pdf-lib installed');
    } catch (e) {
        console.error('❌ pdf-lib not installed. Run: npm install pdf-lib');
        process.exit(1);
    }

    // Check for ocrmypdf
    if (!fs.existsSync('/opt/homebrew/bin/ocrmypdf') && !fs.existsSync('/usr/local/bin/ocrmypdf')) {
        console.error('❌ ocrmypdf not installed. Run: brew install ocrmypdf');
        process.exit(1);
    }
    console.log('✅ ocrmypdf installed');

    // Load progress
    const progress = loadProgress();

    // Find all ZIP files
    const zipFiles = fs.readdirSync(INPUT_DIR)
        .filter(f => f.toLowerCase().endsWith('.zip'))
        .map(f => path.join(INPUT_DIR, f))
        .sort();

    if (zipFiles.length === 0) {
        console.log(`\n📭 No ZIP files found in ${INPUT_DIR}`);
        console.log('👉 Place your .zip files in download/input/ and run again');
        return;
    }

    console.log(`\n📦 Found ${zipFiles.length} ZIP file(s)`);

    // If in LLM mode, also check for existing OCR PDFs that need LLM conversion
    if (GENERATE_LLM) {
        const ocrFiles = fs.readdirSync(OUTPUT_DIR)
            .filter(f => f.endsWith('-ocr.pdf') && !f.startsWith('.'))
            .sort();

        if (ocrFiles.length > 0) {
            console.log(`\n📚 Found ${ocrFiles.length} existing OCR PDF(s) to check for LLM conversion`);
        }
    }

    // Show status summary
    console.log('\n📊 Status Summary:');
    zipFiles.forEach(zipPath => {
        const zipName = path.basename(zipPath);
        const status = getJobStatus(progress, zipName);
        const statusIcon = status.status === 'completed' ? '✅' :
                          status.status === 'failed' ? '❌' :
                          status.status === 'processing' ? '⏳' : '⏸️';
        console.log(`   ${statusIcon} ${zipName} - ${status.status}`);
    });

    // Process each ZIP file
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (const zipPath of zipFiles) {
        try {
            const zipName = path.basename(zipPath);
            const baseName = zipName.replace(/\.zip$/i, '');

            const pdfExists = fs.existsSync(path.join(OUTPUT_DIR, `${baseName}.pdf`));
            const ocrExists = fs.existsSync(path.join(OUTPUT_DIR, `${baseName}-ocr.pdf`));
            const llmExists = fs.existsSync(path.join(OUTPUT_DIR, `${baseName}-llm.pdf`));

            // Skip if already fully completed
            if (pdfExists && ocrExists && (!GENERATE_LLM || llmExists)) {
                skipCount++;
                continue;
            }

            // If PDF and OCR exist but LLM doesn't, skip ZIP processing
            // (LLM will be created in the second phase below)
            if (GENERATE_LLM && pdfExists && ocrExists && !llmExists) {
                skipCount++;
                continue;
            }

            await processZip(zipPath, progress);
            successCount++;
        } catch (error) {
            failCount++;
            console.error(`\n❌ Failed to process ${path.basename(zipPath)}`);
            // Continue with next file
        }
    }

    // If LLM mode is enabled, check for existing OCR PDFs without LLM versions
    if (GENERATE_LLM) {
        console.log('\n' + '='.repeat(80));
        console.log('📚 Checking for existing OCR PDFs without LLM versions...');
        console.log('='.repeat(80));

        const ocrFiles = fs.readdirSync(OUTPUT_DIR)
            .filter(f => f.endsWith('-ocr.pdf') && !f.startsWith('.'))
            .sort();

        const missingLlm = ocrFiles.filter(f => {
            const baseName = f.replace(/-ocr\.pdf$/i, '');
            return !fs.existsSync(path.join(OUTPUT_DIR, `${baseName}-llm.pdf`));
        });

        if (missingLlm.length === 0) {
            console.log('✅ All OCR PDFs already have LLM versions');
        } else if (missingLlm.length >= 3) {
            // Use parallel batch processor for 3+ files
            console.log(`\n🚀 Using parallel processing for ${missingLlm.length} PDFs...`);
            const batchScript = path.join(__dirname, 'ocr-to-llm-pdf.js');

            if (fs.existsSync(batchScript)) {
                try {
                    await runCommand('node', [batchScript], { cwd: OUTPUT_DIR });
                } catch (error) {
                    console.error(`❌ Batch conversion failed:`, error.message);
                }
            } else {
                console.warn('⚠️  ocr-to-llm-pdf.js not found, using sequential processing');
                // Fallback to sequential
                for (const ocrFile of missingLlm) {
                    const baseName = ocrFile.replace(/-ocr\.pdf$/i, '');
                    const ocrPath = path.join(OUTPUT_DIR, ocrFile);
                    const llmPath = path.join(OUTPUT_DIR, `${baseName}-llm.pdf`);

                    console.log(`\n📄 Creating LLM version for: ${ocrFile}`);
                    try {
                        await generateLLM(ocrPath, llmPath);
                    } catch (error) {
                        console.error(`❌ Failed:`, error.message);
                    }
                }
            }
        } else {
            // Sequential for < 3 files
            for (const ocrFile of missingLlm) {
                const baseName = ocrFile.replace(/-ocr\.pdf$/i, '');
                const ocrPath = path.join(OUTPUT_DIR, ocrFile);
                const llmPath = path.join(OUTPUT_DIR, `${baseName}-llm.pdf`);

                console.log(`\n📄 Creating LLM version for: ${ocrFile}`);
                try {
                    await generateLLM(ocrPath, llmPath);
                } catch (error) {
                    console.error(`❌ Failed to create LLM PDF:`, error.message);
                }
            }
        }
    }

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 BATCH PROCESSING COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⏭️  Skipped (already done): ${skipCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);

    if (successCount > 0 || skipCount > 0) {
        console.log('\n📄 Generated files:');
        zipFiles.forEach(zipPath => {
            const baseName = path.basename(zipPath).replace(/\.zip$/i, '');
            const pdfPath = path.join(OUTPUT_DIR, `${baseName}.pdf`);
            const ocrPath = path.join(OUTPUT_DIR, `${baseName}-ocr.pdf`);
            const llmPath = path.join(OUTPUT_DIR, `${baseName}-llm.pdf`);

            if (fs.existsSync(pdfPath)) {
                const sizeMB = (fs.statSync(pdfPath).size / (1024 * 1024)).toFixed(2);
                console.log(`   📄 ${baseName}.pdf (${sizeMB} MB)`);
            }
            if (fs.existsSync(ocrPath)) {
                const sizeMB = (fs.statSync(ocrPath).size / (1024 * 1024)).toFixed(2);
                console.log(`   🔍 ${baseName}-ocr.pdf (${sizeMB} MB)`);
            }
            if (GENERATE_LLM && fs.existsSync(llmPath)) {
                const sizeMB = (fs.statSync(llmPath).size / (1024 * 1024)).toFixed(2);
                console.log(`   📚 ${baseName}-llm.pdf (${sizeMB} MB)`);
            }
        });
    }

    console.log(`\n💾 Progress saved to: ${PROGRESS_FILE}`);
}

// Run the batch processor
processBatch().catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
});
