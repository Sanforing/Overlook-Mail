import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile, stat, mkdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { config } from './config.js';
import { stmt, uploadPath } from './db.js';
import { requireUser } from './auth.js';

function id() { return 'f_' + randomBytes(8).toString('hex'); }

const ROM_EXT = new Set(['.gba','.gb','.gbc','.nes','.smc','.sfc','.md','.gen','.smd','.n64','.z64','.iso','.cue','.zip']);
const NOVEL_EXT = new Set(['.txt','.epub']);

function gateForExt(ext, userTier) {
  if (ROM_EXT.has(ext))   return userTier === 'paid';
  if (NOVEL_EXT.has(ext)) return true; // all tiers — text is processed client-side
  return userTier === 'paid';
}
function maxBytesFor(ext) {
  if (ROM_EXT.has(ext))   return config.limits.romMax;
  if (NOVEL_EXT.has(ext)) return config.limits.novelMax;
  return config.limits.maxUpload;
}

export function registerFiles(app) {
  app.post('/api/files', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    if (!req.isMultipart()) return reply.code(400).send({ error: 'multipart required' });

    const part = await req.file({ limits: { fileSize: config.limits.maxUpload } });
    if (!part) return reply.code(400).send({ error: 'no file' });
    const ext = extname(part.filename || '').toLowerCase();
    const limit = maxBytesFor(ext);
    if (!gateForExt(ext, me.tier)) return reply.code(402).send({ error: 'paid tier required for this file type' });

    const fileId = id();
    const dir = resolve(config.uploadDir, me.id);
    await mkdir(dir, { recursive: true });
    const rel = join(me.id, `${fileId}${ext}`);
    const abs = uploadPath(rel);

    // Stream to disk. Fastify multipart pipes through; we use saveAs-style.
    const buf = await part.toBuffer();
    if (buf.length > limit) return reply.code(413).send({ error: 'file too large' });
    await writeFile(abs, buf);

    const type = part.mimetype || 'application/octet-stream';
    stmt.insertFile.run(fileId, me.id, part.filename || 'upload', type, buf.length, rel, Date.now());
    return { id: fileId, name: part.filename, type, size: buf.length, url: `/api/files/${fileId}/blob` };
  });

  app.get('/api/files/:id', async (req, reply) => {
    const row = stmt.fileById.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    return { id: row.id, name: row.name, type: row.type, size: row.size, ownerId: row.owner_id, url: `/api/files/${row.id}/blob` };
  });

  app.get('/api/files/:id/blob', async (req, reply) => {
    const row = stmt.fileById.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const abs = uploadPath(row.storage_path);
    try { await stat(abs); } catch { return reply.code(410).send({ error: 'file missing on disk' }); }
    reply.header('content-type', row.type);
    reply.header('content-disposition', `inline; filename="${encodeURIComponent(row.name)}"`);
    reply.header('cache-control', 'private, max-age=3600');
    return reply.send(createReadStream(abs));
  });
}
