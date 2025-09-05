import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import morgan from 'morgan';
import cors from 'cors';
import axios from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';

const app = express();

// Enhanced CORS setup for web application compatibility
app.use(cors({
    origin: ['http://localhost:3000', 'https://skatehive.app', 'https://www.skatehive.app', '*'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false
}));

// Additional CORS headers for maximum compatibility
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PUT,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept,X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// Enhanced logging middleware for debugging
app.use((req, res, next) => {
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const origin = req.get('Origin') || req.get('Referer') || 'direct';

    console.log(`🌐 [${new Date().toISOString()}] ${req.method} ${req.path} - Client: ${clientIP} - Origin: ${origin}`);

    // Log request details for transcode operations
    if (req.path === '/transcode') {
        console.log(`📊 TRANSCODE REQUEST START:`);
        console.log(`   📍 Client IP: ${clientIP}`);
        console.log(`   🌍 Origin: ${origin}`);
        console.log(`   🖥️  User Agent: ${userAgent.substring(0, 100)}`);
        console.log(`   ⏰ Start Time: ${new Date().toISOString()}`);
    }

    // Track response time
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        if (req.path === '/transcode') {
            console.log(`✅ TRANSCODE REQUEST COMPLETE - ${res.statusCode} - ${duration}ms`);
        }
    });

    next();
});

const PORT = process.env.PORT || 8080;
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

if (!PINATA_JWT) {
    console.warn('⚠️  PINATA_JWT is not set. Set it in your environment before starting.');
}

app.use(morgan('combined'));
app.get('/', (_req, res) => res.send('🎬 Video Worker - Ready for transcoding!'));
app.head('/', (_req, res) => res.sendStatus(200));
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'video-worker', timestamp: new Date().toISOString() }));

// Configure multer to write incoming file to the OS temp dir
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, os.tmpdir()),
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
    }),
    limits: {
        fileSize: (process.env.MAX_UPLOAD_MB ? parseInt(process.env.MAX_UPLOAD_MB, 10) : 512) * 1024 * 1024 // default 512MB
    }
});

function runFfmpeg(args, requestId = 'unknown') {
    return new Promise((resolve, reject) => {
        console.log(`🎬 [FFMPEG-START] ID: ${requestId} | Command: ffmpeg ${args.join(' ')}`);
        const startTime = Date.now();
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';

        proc.stderr.on('data', (d) => {
            stderr += d.toString();
            // Log progress if available
            const progressMatch = d.toString().match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
            if (progressMatch) {
                console.log(`⏳ [FFMPEG-PROGRESS] ID: ${requestId} | Time: ${progressMatch[1]}`);
            }
        });

        proc.on('close', (code) => {
            const duration = Date.now() - startTime;
            if (code === 0) {
                console.log(`✅ [FFMPEG-SUCCESS] ID: ${requestId} | Duration: ${duration}ms`);
                resolve({ ok: true });
            } else {
                console.error(`❌ [FFMPEG-ERROR] ID: ${requestId} | Code: ${code} | Duration: ${duration}ms | Error: ${stderr.slice(-400)}`);
                reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-4000)}`));
            }
        });
    });
}

// POST /transcode  (multipart form fields: video [required], creator [optional], thumbnail [optional])
app.post('/transcode', upload.single('video'), async (req, res) => {
    const requestId = uuidv4().substring(0, 8); // Short ID for logging
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const origin = req.get('Origin') || req.get('Referer') || 'direct';

    console.log(`\n🚀 [TRANSCODE-START] ID: ${requestId}`);
    console.log(`   📁 File: ${req.file?.originalname || 'unknown'} (${req.file?.size || 0} bytes)`);
    console.log(`   👤 Creator: ${req.body?.creator || 'anonymous'}`);
    console.log(`   📍 Client: ${clientIP}`);
    console.log(`   🌍 Origin: ${origin}`);
    console.log(`   🖥️  User Agent: ${userAgent.substring(0, 50)}...`);

    if (!req.file) {
        console.log(`❌ [TRANSCODE-ERROR] ID: ${requestId} | No file uploaded`);
        return res.status(400).json({ error: 'No file uploaded. Send multipart/form-data with field "video".' });
    }

    const inputPath = req.file.path;
    const outName = `${uuidv4()}.mp4`;
    const outputPath = path.join(os.tmpdir(), outName);

    try {
        console.log(`🔄 [TRANSCODE-PROCESSING] ID: ${requestId} | Input: ${inputPath} | Output: ${outputPath}`);

        // Transcode to a broadly compatible H.264/AAC MP4
        const ffArgs = [
            '-y',
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', process.env.X264_PRESET || 'veryfast',
            '-crf', process.env.X264_CRF || '22',
            '-c:a', 'aac',
            '-b:a', process.env.AAC_BITRATE || '128k',
            '-movflags', '+faststart',
            outputPath
        ];

        await runFfmpeg(ffArgs, requestId);

        // Upload to Pinata
        if (!PINATA_JWT) {
            throw new Error('PINATA_JWT not configured on server');
        }

        console.log(`☁️ [IPFS-UPLOAD-START] ID: ${requestId} | File: ${outName}`);

        // Read optional text fields from the multipart form
        const creator = (req.body?.creator ?? '').toString().trim().slice(0, 64) || 'anonymous';
        const thumbnailRaw = (req.body?.thumbnail ?? req.body?.thumbnailUrl ?? '').toString().trim();
        const thumbnail = thumbnailRaw ? thumbnailRaw.slice(0, 2048) : '';

        const form = new FormData();
        form.append('file', fs.createReadStream(outputPath), { filename: outName, contentType: 'video/mp4' });

        // Pinata metadata with optional keyvalues
        const metadata = {
            name: `transcoded-${new Date().toISOString()}.mp4`,
            keyvalues: {
                creator,
                requestId,
                clientIP: clientIP.substring(0, 20), // truncated for privacy
                ...(thumbnail ? { thumbnail } : {})
            }
        };
        form.append('pinataMetadata', JSON.stringify(metadata));

        const options = { cidVersion: 1 };
        form.append('pinataOptions', JSON.stringify(options));

        const resp = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    Authorization: `Bearer ${PINATA_JWT}`
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );

        const { IpfsHash: cid } = resp.data;
        const gatewayUrl = `${PINATA_GATEWAY.replace(/\/+$/, '')}/${cid}`;
        const totalDuration = Date.now() - startTime;

        console.log(`🎉 [TRANSCODE-SUCCESS] ID: ${requestId}`);
        console.log(`   📦 CID: ${cid}`);
        console.log(`   🌐 Gateway: ${gatewayUrl}`);
        console.log(`   ⏱️  Total Duration: ${totalDuration}ms`);
        console.log(`   👤 Creator: ${creator}`);
        console.log(`   📍 Client: ${clientIP}`);

        res.status(200).json({
            cid,
            gatewayUrl,
            requestId,
            duration: totalDuration,
            creator,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        const totalDuration = Date.now() - startTime;
        console.error(`💥 [TRANSCODE-FAILED] ID: ${requestId} | Duration: ${totalDuration}ms | Error: ${err.message}`);
        console.error(`💥 [TRANSCODE-FAILED] ID: ${requestId} | Client: ${clientIP} | Origin: ${origin}`);
        res.status(500).json({
            error: err.message || 'Transcode failed',
            requestId,
            duration: totalDuration,
            timestamp: new Date().toISOString()
        });
    } finally {
        // Cleanup
        try {
            fs.unlinkSync(inputPath);
            console.log(`🗑️ [CLEANUP] ID: ${requestId} | Removed input file: ${inputPath}`);
        } catch { }
        try {
            fs.unlinkSync(outputPath);
            console.log(`🗑️ [CLEANUP] ID: ${requestId} | Removed output file: ${outputPath}`);
        } catch { }
    }
});

app.listen(PORT, () => {
    console.log(`🎬 Video worker listening on :${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/healthz`);
    console.log(`🎯 Transcode endpoint: http://localhost:${PORT}/transcode`);
    console.log(`📊 Dashboard monitoring enabled with rich logging`);
});
