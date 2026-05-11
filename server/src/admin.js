/**
 * Admin endpoints. Only accessible to users with tier === 'admin'.
 * Promote a user via:
 *   - ADMIN_EMAILS env var (comma-separated) — auto-promoted on each startup
 *   - SQL: UPDATE users SET tier = 'admin' WHERE email = '...';
 */
import { db, stmt, publicUser } from './db.js';
import { currentUser } from './auth.js';

function requireAdmin(req, reply) {
  const u = currentUser(req);
  if (!u) { reply.code(401).send({ error: 'unauthorized' }); return null; }
  if (u.tier !== 'admin') { reply.code(403).send({ error: 'admin only' }); return null; }
  return u;
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return {}; } }

// One-shot prepared statements used only by the admin panel.
const adminStmt = {
  allUsers: db.prepare(`
    SELECT id, email, display_name, initials, tier, created_at
    FROM users ORDER BY created_at DESC
  `),
  countUsers:    db.prepare(`SELECT COUNT(*) AS n FROM users`),
  countByTier:   db.prepare(`SELECT tier, COUNT(*) AS n FROM users GROUP BY tier`),
  countMails:    db.prepare(`SELECT COUNT(*) AS n FROM mails`),
  countMailsViz: db.prepare(`SELECT visibility, COUNT(*) AS n FROM mails GROUP BY visibility`),
  countFiles:    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM files`),
  recentUsers:   db.prepare(`SELECT created_at FROM users ORDER BY created_at DESC LIMIT 200`),
  deleteUser:    db.prepare(`DELETE FROM users WHERE id = ?`),
  filesAll:      db.prepare(`
    SELECT f.id, f.name, f.type, f.size, f.created_at,
           f.owner_id, u.display_name AS owner_name, u.email AS owner_email
    FROM files f LEFT JOIN users u ON u.id = f.owner_id
    ORDER BY f.created_at DESC LIMIT 500
  `),
  deleteFile:    db.prepare(`DELETE FROM files WHERE id = ?`),
  mailsAll:      db.prepare(`
    SELECT m.id, m.owner_id, m.visibility, m.folder, m.type, m.data,
           m.created_at, m.updated_at,
           u.display_name AS owner_name, u.email AS owner_email
    FROM mails m LEFT JOIN users u ON u.id = m.owner_id
    ORDER BY m.created_at DESC LIMIT 500
  `)
};

/**
 * Promote configured admin emails on startup. Runs after DB init.
 */
export function bootstrapAdmins(emails) {
  if (!emails || !emails.length) return;
  for (const raw of emails) {
    const email = String(raw).trim().toLowerCase();
    if (!email) continue;
    const u = stmt.userByEmail.get(email);
    if (u && u.tier !== 'admin') {
      stmt.setUserTier.run('admin', u.id);
    }
  }
}

export function registerAdmin(app) {
  // ── Stats ──
  app.get('/api/admin/stats', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const userCount   = adminStmt.countUsers.get().n;
    const tierRows    = adminStmt.countByTier.all();
    const mailCount   = adminStmt.countMails.get().n;
    const mailViz     = adminStmt.countMailsViz.all();
    const filesAgg    = adminStmt.countFiles.get();
    const recents     = adminStmt.recentUsers.all().map(r => r.created_at);

    // signups per day, last 14 days
    const day = 86400_000;
    const today = new Date(); today.setHours(0,0,0,0);
    const buckets = [];
    for (let i = 13; i >= 0; i--) {
      const start = today.getTime() - i * day;
      const end = start + day;
      const n = recents.filter(t => t >= start && t < end).length;
      buckets.push({ date: new Date(start).toISOString().slice(0,10), count: n });
    }

    return {
      users: { total: userCount, byTier: tierRows },
      mails: { total: mailCount, byVisibility: mailViz },
      files: { total: filesAgg.n, bytes: filesAgg.bytes },
      signupsPerDay: buckets
    };
  });

  // ── Users ──
  app.get('/api/admin/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return adminStmt.allUsers.all().map(r => ({
      id: r.id, email: r.email, displayName: r.display_name,
      initials: r.initials, tier: r.tier, createdAt: r.created_at
    }));
  });

  app.patch('/api/admin/users/:id/tier', async (req, reply) => {
    const me = requireAdmin(req, reply); if (!me) return;
    const { tier } = req.body || {};
    if (!['free','paid','admin'].includes(tier)) {
      return reply.code(400).send({ error: "tier must be 'free', 'paid', or 'admin'" });
    }
    const target = stmt.userById.get(req.params.id);
    if (!target) return reply.code(404).send({ error: 'not found' });
    if (target.id === me.id && tier !== 'admin') {
      return reply.code(400).send({ error: 'cannot demote yourself' });
    }
    stmt.setUserTier.run(tier, target.id);
    return publicUser(stmt.userById.get(target.id));
  });

  app.delete('/api/admin/users/:id', async (req, reply) => {
    const me = requireAdmin(req, reply); if (!me) return;
    if (req.params.id === me.id) return reply.code(400).send({ error: 'cannot delete yourself' });
    const target = stmt.userById.get(req.params.id);
    if (!target) return reply.code(404).send({ error: 'not found' });
    adminStmt.deleteUser.run(target.id); // CASCADE removes mails/files/sessions
    return { ok: true };
  });

  // ── Mails ──
  app.get('/api/admin/mails', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return adminStmt.mailsAll.all().map(r => {
      const data = safeJSON(r.data);
      return {
        id: r.id,
        ownerId: r.owner_id,
        ownerName: r.owner_name,
        ownerEmail: r.owner_email,
        visibility: r.visibility,
        folder: r.folder,
        type: r.type,
        subject: data.subject || '(no subject)',
        sender: data.sender?.name || data.sender?.email || '',
        createdAt: r.created_at
      };
    });
  });

  app.delete('/api/admin/mails/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    stmt.deleteMail.run(req.params.id);
    return { ok: true };
  });

  // ── Files ──
  app.get('/api/admin/files', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return adminStmt.filesAll.all().map(r => ({
      id: r.id, name: r.name, type: r.type, size: r.size,
      ownerId: r.owner_id, ownerName: r.owner_name, ownerEmail: r.owner_email,
      createdAt: r.created_at
    }));
  });

  app.delete('/api/admin/files/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    adminStmt.deleteFile.run(req.params.id);
    return { ok: true };
  });
}
