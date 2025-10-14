#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

/**
 * Batch convert multiple OCR PDFs to LLM-friendly format in parallel
 *
 * PERFORMANCE NOTE:
 * - Ghostscript is single-threaded per PDF file
 * - Speed: ~0.2-0.5 seconds per page (100 pages ≈ 20-50 seconds)
 * - This script processes MULTIPLE PDFs in parallel for faster batch conversion
 * - For single large PDFs, processing time is inherently sequential
 */

// Configuration - Optimized for speed and LLM processing
const NUM_WORKERS = Math.max(1, os.cpus().length - 2); // Leave 2 cores free
const DPI = 96;  // Lower DPI for faster processing (still readable for LLMs)
const QUALITY = 60;  // Lower quality for smaller files and faster processing

/**
 * Check if Ghostscript is installed
 */
function checkGhostscript() {
    const paths = [
        '/opt/homebrew/bin/gs',
        '/usr/local/bin/gs',
        '/usr/bin/gs'
    ];

    for (const gsPath of paths) {
        if (fs.existsSync(gsPath)) {
            return gsPath;
        }
    }

    return null;
}

/**
 * Convert a single PDF to LLM-friendly format
 */
async function convertPDF(gsPath, inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const gsArgs = [
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            '-dPDFSETTINGS=/screen',
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            '-dSAFER',
            // Multi-threading for Ghostscript
            `-dNumRenderingThreads=${Math.min(4, os.cpus().length)}`,
            // Image compression
            `-dDownsampleColorImages=true`,
            `-dDownsampleGrayImages=true`,
            `-dDownsampleMonoImages=true`,
            `-dColorImageResolution=${DPI}`,
            `-dGrayImageResolution=${DPI}`,
            `-dMonoImageResolution=${DPI * 2}`,
            `-dColorImageDownsampleType=/Bicubic`,
            `-dGrayImageDownsampleType=/Bicubic`,
            `-dMonoImageDownsampleType=/Subsample`,
            // JPEG compression
            `-dAutoFilterColorImages=false`,
            `-dAutoFilterGrayImages=false`,
            `-dColorImageFilter=/DCTEncode`,
            `-dGrayImageFilter=/DCTEncode`,
            `-dJPEGQ=${QUALITY}`,
            // Optimize
            `-dSubsetFonts=true`,
            `-dCompressFonts=true`,
            `-dEmbedAllFonts=false`,
            `-dDetectDuplicateImages=true`,
            `-dFastWebView=true`,
            // Output
            `-sOutputFile=${outputPath}`,
            inputPath
        ];

        const gs = spawn(gsPath, gsArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';

        gs.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        gs.on('close', (code) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            if (code === 0 && fs.existsSync(outputPath)) {
                const inputStats = fs.statSync(inputPath);
                const outputStats = fs.statSync(outputPath);

                resolve({
                    inputPath: path.basename(inputPath),
                    outputPath: path.basename(outputPath),
                    inputSize: inputStats.size,
                    outputSize: outputStats.size,
                    ratio: parseFloat((inputStats.size / outputStats.size).toFixed(1)),
                    duration: parseFloat(duration)
                });
            } else {
                reject(new Error(`Ghostscript failed with code ${code}: ${stderr}`));
            }
        });

        gs.on('error', (error) => {
            reject(new Error(`Failed to start Ghostscript: ${error.message}`));
        });
    });
}

/**
 * Process PDFs in parallel batches
 */
async function processBatch() {
    console.log('\n🚀 Batch LLM PDF Converter (Parallel)');
    console.log('='.repeat(80));
    console.log(`Workers: ${NUM_WORKERS} parallel processes`);
    console.log(`Settings: ${DPI} DPI, Quality ${QUALITY} (optimized for speed + LLMs)`);

    const gsPath = checkGhostscript();
    if (!gsPath) {
        console.error('\n❌ Error: Ghostscript is not installed!');
        console.log('Install: brew install ghostscript');
        process.exit(1);
    }

    // Find all *-ocr.pdf files
    const ocrFiles = fs.readdirSync('.')
        .filter(f => f.endsWith('-ocr.pdf'))
        .map(f => {
            const baseName = f.replace(/-ocr\.pdf$/i, '');
            return {
                input: f,
                output: `${baseName}-llm.pdf`
            };
        })
        .filter(pair => !fs.existsSync(pair.output)) // Skip if LLM version exists
        .sort();

    if (ocrFiles.length === 0) {
        console.log('\n📭 No OCR PDFs found (or all LLM versions already exist)');
        return;
    }

    console.log(`\n📦 Found ${ocrFiles.length} OCR PDF(s) to convert\n`);

    const startTime = Date.now();
    const results = [];
    const errors = [];

    // Process in parallel batches
    for (let i = 0; i < ocrFiles.length; i += NUM_WORKERS) {
        const batch = ocrFiles.slice(i, i + NUM_WORKERS);
        const batchNum = Math.floor(i / NUM_WORKERS) + 1;
        const totalBatches = Math.ceil(ocrFiles.length / NUM_WORKERS);

        console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} files):`);
        batch.forEach(pair => console.log(`   - ${pair.input}`));

        // Process batch in parallel
        const batchPromises = batch.map(async (pair) => {
            try {
                const result = await convertPDF(gsPath, pair.input, pair.output);
                const sizeMB = (result.outputSize / (1024 * 1024)).toFixed(2);
                console.log(`   ✅ ${pair.output} (${sizeMB} MB, ${result.ratio}x smaller, ${result.duration}s)`);
                return result;
            } catch (error) {
                console.error(`   ❌ ${pair.input}: ${error.message}`);
                return { error: error.message, file: pair.input };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach(result => {
            if (result.error) {
                errors.push(result);
            } else {
                results.push(result);
            }
        });

        console.log(''); // Empty line between batches
    }

    // Summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('='.repeat(80));
    console.log('📊 CONVERSION COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Successful: ${results.length}`);
    console.log(`❌ Failed: ${errors.length}`);

    if (results.length > 0) {
        const totalInputSize = results.reduce((sum, r) => sum + r.inputSize, 0);
        const totalOutputSize = results.reduce((sum, r) => sum + r.outputSize, 0);
        const avgRatio = results.reduce((sum, r) => sum + r.ratio, 0) / results.length;

        console.log(`\n📊 Statistics:`);
        console.log(`   Total input size: ${(totalInputSize / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`   Total output size: ${(totalOutputSize / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`   Average compression: ${avgRatio.toFixed(1)}x`);
        console.log(`   Space saved: ${((totalInputSize - totalOutputSize) / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`   Total time: ${totalTime}s`);
        console.log(`   Speed: ${(results.length / parseFloat(totalTime)).toFixed(2)} PDFs/sec`);
    }

    if (errors.length > 0) {
        console.log(`\n❌ Failed files:`);
        errors.forEach(e => console.log(`   - ${e.file}: ${e.error}`));
    }
}

// Run
processBatch().catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
});
