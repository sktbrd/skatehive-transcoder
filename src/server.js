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
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs'; // optional

if (!PINATA_JWT) {
  console.warn('⚠️  PINATA_JWT is not set. Set it in your environment before starting.');
}

app.use(morgan('combined'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

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

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

// POST /transcode  (multipart form fields: video [required], creator [optional], thumbnail [optional])
app.post('/transcode', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send multipart/form-data with field "video".' });
  }
  const inputPath = req.file.path;
  const outName = `${uuidv4()}.mp4`;
  const outputPath = path.join(os.tmpdir(), outName);

  try {
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
    await runFfmpeg(ffArgs);

    // Upload to Pinata
    if (!PINATA_JWT) {
      throw new Error('PINATA_JWT not configured on server');
    }

    // ---- NEW: read optional text fields from the same multipart form ----
    // Accept "creator" and either "thumbnail" or "thumbnailUrl"
    const creator =
      (req.body?.creator ?? '').toString().trim().slice(0, 64) || 'anonymous';
    const thumbnailRaw =
      (req.body?.thumbnail ?? req.body?.thumbnailUrl ?? '').toString().trim();
    const thumbnail = thumbnailRaw ? thumbnailRaw.slice(0, 2048) : '';

    const form = new FormData();
    form.append('file', fs.createReadStream(outputPath), { filename: outName, contentType: 'video/mp4' });

    // Pinata metadata with optional keyvalues
    const metadata = {
      name: `transcoded-${new Date().toISOString()}.mp4`,
      keyvalues: {
        creator, // always include (defaults to "anonymous")
        ...(thumbnail ? { thumbnail } : {}) // include only if provided
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
    res.status(200).json({ cid, gatewayUrl });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Transcode failed' });
  } finally {
    // Cleanup
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`Video worker listening on :${PORT}`);
});
