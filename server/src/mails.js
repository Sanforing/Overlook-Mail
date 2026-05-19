import { randomBytes } from 'node:crypto';
import { stmt } from './db.js';
import { requireUser, currentUser } from './auth.js';

function id() { return 'm_' + randomBytes(8).toString('hex'); }

function safeJSON(s) { try { return JSON.parse(s); } catch { return {}; } }

/**
 * The mail "data" column stores the full mail record JSON (sender, subject,
 * preview, date, template, monochrome, config, …). The columns owner_id,
 * visibility, folder, type are denormalized for cheap filtering.
 */
function rowToMail(row) {
  const data = safeJSON(row.data);
  return Object.assign({}, data, {
    id: row.id,
    ownerId: row.owner_id,
    visibility: row.visibility,
    folder: row.folder,
    type: row.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

export function registerMails(app) {
  app.get('/api/mails', async (req) => {
    const me = currentUser(req);
    const allRows = stmt.allMails.all();
    const list = allRows.map(rowToMail).filter(m => {
      if (m.visibility === 'private' && (!me || m.ownerId !== me.id)) return false;
      return true;
    });
    return list;
  });

  app.get('/api/mails/:id', async (req, reply) => {
    const row = stmt.mailById.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const m = rowToMail(row);
    if (m.visibility === 'private') {
      const me = currentUser(req);
      if (!me || me.id !== m.ownerId) return reply.code(403).send({ error: 'forbidden' });
    }
    return m;
  });

  app.post('/api/mails', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const body = req.body || {};
    const newId = body.id || id();
    const data = JSON.stringify(Object.assign({}, body, {
      id: newId,
      ownerId: me.id,
      ownerName: me.display_name,
      sender: body.sender || { name: me.display_name, email: me.email, title: 'Self', company: '' },
      recipient: body.recipient || me.display_name,
      template: body.template || 'default',
      monochrome: body.monochrome || 'none'
    }));
    const now = Date.now();
    stmt.insertMail.run(
      newId, me.id,
      body.visibility === 'public' ? 'public' : 'private',
      body.folder || 'mine',
      body.type || 'local',
      data, now, now
    );
    return rowToMail(stmt.mailById.get(newId));
  });

  app.patch('/api/mails/:id', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const row = stmt.mailById.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    if (row.owner_id !== me.id) return reply.code(403).send({ error: 'forbidden' });
    const cur = safeJSON(row.data);
    const merged = Object.assign({}, cur, req.body || {});
    const now = Date.now();
    stmt.updateMail.run(
      merged.visibility === 'public' ? 'public' : 'private',
      merged.folder || row.folder,
      merged.type || row.type,
      JSON.stringify(merged),
      now,
      row.id
    );
    return rowToMail(stmt.mailById.get(row.id));
  });

  app.delete('/api/mails/:id', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const row = stmt.mailById.get(req.params.id);
    if (!row) return { ok: true };
    if (row.owner_id !== me.id) return reply.code(403).send({ error: 'forbidden' });
    stmt.deleteMail.run(row.id);
    return { ok: true };
  });

  // Game saves are per-user-per-mail.
  app.put('/api/saves/:mailId', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const data = JSON.stringify(req.body ?? null);
    stmt.upsertSave.run(req.params.mailId, me.id, data, Date.now());
    return { ok: true };
  });
  app.get('/api/saves/:mailId', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const row = stmt.getSave.get(req.params.mailId, me.id);
    return row ? safeJSON(row.data) : null;
  });

  app.put('/api/state/:key', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const data = JSON.stringify(req.body ?? null);
    stmt.upsertAppState.run(req.params.key, me.id, data, Date.now());
    return { ok: true };
  });
  app.get('/api/state/:key', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const row = stmt.getAppState.get(req.params.key, me.id);
    return row ? safeJSON(row.data) : null;
  });

  app.get('/api/comments/:mailId', async (req) => {
    const row = stmt.getComments.get(req.params.mailId);
    return row ? safeJSON(row.data) : { entries: [] };
  });
  app.put('/api/comments/:mailId', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const entries = Array.isArray(body.entries) ? body.entries.slice(-500).map(c => ({
      userId: typeof c.userId === 'string' ? c.userId.slice(0, 128) : '',
      name: typeof c.name === 'string' ? c.name.slice(0, 128) : 'Anonymous',
      text: typeof c.text === 'string' ? c.text.slice(0, 4000) : '',
      ts: Number.isFinite(Number(c.ts)) ? Number(c.ts) : Date.now()
    })).filter(c => c.text) : [];
    const data = JSON.stringify({ entries });
    stmt.upsertComments.run(req.params.mailId, data, Date.now());
    return { ok: true };
  });
}


