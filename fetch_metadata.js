const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE_DIR = path.join(__dirname, 'Videos');
const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');

function getVideosMissingMetadata(dir) {
    let missing = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
        if (item.name === 'node_modules' || item.name.startsWith('.')) continue;
        
        const itemPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
            missing = missing.concat(getVideosMissingMetadata(itemPath));
        } else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (['.mp4', '.mkv', '.webm', '.avi', '.mov'].includes(ext)) {
                const baseName = item.name.substring(0, item.name.lastIndexOf('.'));
                const hasDescription = fs.existsSync(path.join(dir, baseName + '.description'));
                if (!hasDescription) {
                    missing.push({ path: itemPath, baseName: baseName, dir: dir });
                }
            }
        }
    }
    return missing;
}

async function fetchMetadataForVideo(videoObj) {
    return new Promise((resolve) => {
        // Try to extract ID from filename [ID]
        let query = '';
        const match = videoObj.baseName.match(/\[([a-zA-Z0-9_-]{11})\]$/);
        if (match) {
            query = `https://youtube.com/watch?v=${match[1]}`;
            console.log(`[+] Found YouTube ID for: ${videoObj.baseName} -> ${query}`);
        } else {
            query = `ytsearch1:${videoObj.baseName}`;
            console.log(`[~] No ID found, searching: ${query}`);
        }

        const outputTemplate = path.join(videoObj.dir, videoObj.baseName + '.%(ext)s');
        
        const args = [
            query,
            '--skip-download',
            '--write-description',
            '--write-info-json',
            '--no-write-playlist-metafiles',
            '-o', outputTemplate
        ];
        
        const child = spawn(ytDlpPath, args);
        
        child.on('close', (code) => {
            console.log(`[✓] Finished ${videoObj.baseName} with code ${code}`);
            resolve();
        });
    });
}

async function run() {
    console.log('Scanning for videos missing metadata...');
    const missing = getVideosMissingMetadata(BASE_DIR);
    console.log(`Found ${missing.length} videos missing metadata.`);
    
    for (const video of missing) {
        await fetchMetadataForVideo(video);
    }
    console.log('Metadata backfill complete!');
}

run();
