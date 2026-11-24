import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createApp } from '../../server/index';
import { resetAuthStateForTests } from '../../server/auth';
import { resetUsage } from '../../server/usage';
import { resetSettingsCache, setSettingsFileForTests } from '../../server/settings';

let dir = '';

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kitta-auth-'));
  setSettingsFileForTests(join(dir, 'settings.json'));
  resetAuthStateForTests();
  process.env.KITTA_USAGE_FILE = 'off';
  delete process.env.KITTA_ADMIN_RESET;
  await resetUsage();
});

afterEach(() => {
  resetSettingsCache();
  resetAuthStateForTests();
  delete process.env.KITTA_ADMIN_RESET;
  rmSync(dir, { recursive: true, force: true });
});

describe('admin authentication', () => {
  it('sets up on first run, stores only a salted hash, and reports status without secrets', async () => {
    const agent = request.agent(createApp());
    expect((await agent.get('/api/auth/status')).body).toEqual({ configured: false, authenticated: false });
    const password = 'local-test-password';
    await agent.post('/api/auth/setup').send({ password }).expect(201, { authenticated: true });
    expect((await agent.get('/api/auth/status')).body).toEqual({ configured: true, authenticated: true });
    const stored = readFileSync(join(dir, 'settings.json'), 'utf8');
    expect(stored).not.toContain(password);
    expect(stored).toMatch(/"salt"\s*:\s*"[^"]+"/);
    expect(stored).toMatch(/"hash"\s*:\s*"[^"]+"/);
  });

  it('rejects wrong passwords with a generic response and accepts the right one', async () => {
    const app = createApp();
    await request(app).post('/api/auth/setup').send({ password: 'correct-password' }).expect(201);
    const wrong = await request(app).post('/api/auth/login').send({ password: 'wrong-password' }).expect(401);
    expect(wrong.body).toEqual({ error: 'Invalid credentials.' });
    expect(JSON.stringify(wrong.body)).not.toContain('password');
    await request(app).post('/api/auth/login').send({ password: 'correct-password' }).expect(200);
  });

  it('invalidates the session on sign-out and does not accept a forged cookie', async () => {
    const agent = request.agent(createApp());
    await agent.post('/api/auth/setup').send({ password: 'correct-password' }).expect(201);
    await agent.get('/api/settings').expect(200);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/settings').expect(401);
    await request(createApp()).get('/api/settings').set('Cookie', 'kitta_admin_session=not-a-real-token').expect(401);
  });

  it('consumes the local reset flag once and does not include credentials in responses', async () => {
    const app = createApp();
    await request(app).post('/api/auth/setup').send({ password: 'correct-password' }).expect(201);
    process.env.KITTA_ADMIN_RESET = '1';
    resetAuthStateForTests();
    expect((await request(app).get('/api/auth/status')).body).toEqual({ configured: false, authenticated: false });
    await request(app).post('/api/auth/setup').send({ password: 'new-password' }).expect(201);
    const second = await request(app).post('/api/auth/setup').send({ password: 'third-password' }).expect(409);
    expect(JSON.stringify(second.body)).not.toContain('new-password');
  });
});

describe('protected routes', () => {
  it('protects settings and usage reset while leaving health and character reads open', async () => {
    const app = createApp();
    await request(app).get('/api/settings').expect(401);
    await request(app).put('/api/settings').send({ OPENAI_API_KEY: 'never-return-this' }).expect(401);
    await request(app).delete('/api/usage').expect(401);
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/characters').expect(200);
    const agent = request.agent(app);
    await agent.post('/api/auth/setup').send({ password: 'correct-password' }).expect(201);
    const settings = await agent.get('/api/settings').expect(200);
    expect(JSON.stringify(settings.body)).not.toContain('never-return-this');
    await agent.put('/api/settings').send({ OPENAI_API_KEY: 'never-return-this' }).expect(200);
    const body = await agent.get('/api/settings').expect(200);
    expect(JSON.stringify(body.body)).not.toContain('never-return-this');
    await agent.delete('/api/usage').expect(204);
  });
});
