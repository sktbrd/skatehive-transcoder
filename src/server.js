import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import morgan from 'morgan';
import axios from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 8080;

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = (process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs').replace(/\/+$/, '');

if (!PINATA_JWT) {
  console.warn('⚠️  PINATA_JWT is not set. Set it in your environment before starting.');
}

// Basic health & probe-friendly routes
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.send('OK'));
app.head('/', (_req, res) => res.sendStatus(200));

app.use(morgan('combined'));

// Multer: store uploads in OS temp dir; size limit via env (MB)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: {
    fileSize: (process.env.MAX_UPLOAD_MB ? parseInt(process.env.MAX_UPLOAD_MB, 10) : 512) * 1024 * 1024
  }
});

// ---------- ffprobe/ffmpeg helpers ----------
function execProbe(inputPath) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', [
      '-v','error',
      '-show_streams',
      '-select_streams','v:0,a:0',
      '-of','json',
      inputPath
    ], { stdio: ['ignore','pipe','pipe'] });

    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err}`));
      try {
        const data = JSON.parse(out);
        const streams = data.streams || [];
        const v = streams.find(s => s.codec_type === 'video');
        const a = streams.find(s => s.codec_type === 'audio');
        resolve({
          vcodec: v?.codec_name || null,
          acodec: a?.codec_name || null,
          width: v?.width || null,
          height: v?.height || null,
        });
      } catch (e) { reject(e); }
    });
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

// ---------- Main endpoint ----------
/**
 * POST /transcode
 * multipart/form-data:
 *   - video (file)        : required
 *   - creator (text)      : optional
 *   - thumbnailUrl (text) : optional (alias "thumbnail" also accepted)
 */
app.post('/transcode', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send multipart/form-data with field "video".' });
  }

  const inputPath = req.file.path;
  const outName = `${uuidv4()}.mp4`;
  const outputPath = path.join(os.tmpdir(), outName);

  try {
    // --- Transcode or remux ---
    const info = await execProbe(inputPath);

    const threads = process.env.FFMPEG_THREADS || '1';
    const preset = process.env.X264_PRESET || 'veryfast';
    const crf    = process.env.X264_CRF    || '22';
    const aacBR  = process.env.AAC_BITRATE || '128k';
    const maxH   = process.env.FFMPEG_MAX_HEIGHT ? parseInt(process.env.FFMPEG_MAX_HEIGHT, 10) : null;

    if (info.vcodec === 'h264' && info.acodec === 'aac') {
      // Fast remux (already compatible)
      await runFfmpeg(['-y','-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath]);
    } else {
      // Full encode to H.264/AAC MP4 (free-tier friendly defaults via env)
      const args = ['-y','-i', inputPath];
      if (maxH && Number.isFinite(maxH)) args.push('-vf', `scale=-2:${maxH}`);
      args.push(
        '-c:v','libx264',
        '-preset', preset,
        '-crf', crf,
        '-threads', threads,
        '-c:a','aac',
        '-b:a', aacBR,
        '-movflags','+faststart',
        outputPath
      );
      await runFfmpeg(args);
    }

    // --- Build Pinata metadata (creator/thumbnailUrl are OPTIONAL) ---
    const rawCreator = (req.body?.creator ?? '').toString().trim();
    const creator = rawCreator.length ? rawCreator.slice(0, 64) : 'anonymous';

    const rawThumb = (req.body?.thumbnailUrl ?? req.body?.thumbnail ?? '').toString().trim();
    const thumbnailUrl = rawThumb ? rawThumb.slice(0, 2048) : '';

    const userAgent = (req.headers['user-agent'] || '').slice(0, 100);
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(userAgent) ? 'true' : 'false';
    const uploadDate = new Date().toISOString();
    const fileType = (req.file?.mimetype || 'video/mp4');

    const pinataMetadata = {
      name: `transcoded-${creator}-${uploadDate}.mp4`,
      keyvalues: {
        creator,            // uploader username or "anonymous"
        fileType,           // e.g., "video/quicktime"
        uploadDate,         // ISO timestamp
        isMobile,           // "true"/"false"
        userAgent,          // truncated UA
        ...(thumbnailUrl ? { thumbnailUrl } : {})
      }
    };

    if (!PINATA_JWT) throw new Error('PINATA_JWT not configured on server');

    const form = new FormData();
    form.append('file', fs.createReadStream(outputPath), { filename: outName, contentType: 'video/mp4' });
    form.append('pinataMetadata', JSON.stringify(pinataMetadata));
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const resp = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      form,
      {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${PINATA_JWT}` },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const { IpfsHash: cid } = resp.data;
    const gatewayUrl = `${PINATA_GATEWAY}/${cid}`;
    res.status(200).json({ cid, gatewayUrl });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Transcode failed' });
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`Video worker listening on :${PORT}`);
});
