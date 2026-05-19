import { requireUser } from './auth.js';

export function registerFiles(app) {
  app.post('/api/files', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    return reply.code(410).send({ error: 'server file uploads are disabled; files stay in browser storage' });
  });

  app.get('/api/files/:id', async (req, reply) => {
    return reply.code(410).send({ error: 'server-stored files are disabled' });
  });

  app.get('/api/files/:id/blob', async (req, reply) => {
    return reply.code(410).send({ error: 'server-stored files are disabled' });
  });
}
