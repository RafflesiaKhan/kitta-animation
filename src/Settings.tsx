import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { authStatus, getSettings, login, logout, setupPassword, testSettingProvider, updateSettings, type SettingsResponse } from './api';

const keys = [
  ['OPENAI_API_KEY', 'OpenAI'], ['GEMINI_API_KEY', 'Gemini'], ['ANTHROPIC_API_KEY', 'Anthropic'],
  ['ELEVENLABS_API_KEY', 'ElevenLabs'], ['VOICESTUDIO_API_KEY', 'VoiceStudio API key'],
] as const;
const models = [['OPENAI_TEXT_MODEL','Text'],['OPENAI_IMAGE_MODEL','OpenAI pictures'],['GEMINI_TEXT_MODEL','Gemini text'],['GEMINI_IMAGE_MODEL','Gemini pictures'],['GEMINI_TTS_MODEL','Gemini voice'],['OPENAI_TTS_MODEL','OpenAI voice'],['ELEVENLABS_MODEL','ElevenLabs voice'],['ANTHROPIC_MODEL','Claude / vector drawing']] as const;

export function Settings() {
  const [status, setStatus] = useState<{ configured: boolean; authenticated: boolean }>();
  const [data, setData] = useState<SettingsResponse>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [test, setTest] = useState<Record<string, string>>({});

  async function load() { const s = await authStatus(); setStatus(s); if (s.authenticated) setData(await getSettings()); }
  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : 'Could not load Settings.')); }, []);
  async function enter(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); setPassword(''); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); } finally { setBusy(false); } }
  async function save(name: string, value: string | null) { await enter(async () => { const next = await updateSettings({ [name]: value }); setData(next); setDraft(d => { const copy = { ...d }; delete copy[name]; return copy; }); }); }
  if (!status) return <main><section className="panel"><p role="status">Loading Settings…</p></section></main>;
  if (!status.authenticated) return <main><section className="panel settings-page"><h2>{status.configured ? 'Sign in to Settings' : 'Create an admin password'}</h2><p className="hint">Your password protects saved keys and model choices on this computer.</p>{error && <p className="error" role="alert">{error}</p>}<form onSubmit={e => { e.preventDefault(); void enter(() => status.configured ? login(password) : setupPassword(password)); }}><label className="field">Admin password<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoFocus /></label><button className="btn" disabled={busy || password.length < 8}>{status.configured ? 'Sign in' : 'Create password'}</button></form><a className="btn secondary settings-back" href="/">Back to Studio</a></section></main>;
  return <main><section className="panel settings-page"><header className="settings-title"><div><h2>Settings</h2><p className="hint">Keys stay on the server and are shown here only in masked form.</p></div><a className="pill" href="/">Studio</a></header>{error && <p className="error" role="alert">{error}</p>}<section><h3>Keys</h3>{keys.map(([name, label]) => <KeyRow key={name} name={name} label={label} data={data} draft={draft} setDraft={setDraft} save={save} test={test} setTest={setTest} />)}<KeyRow name="VOICESTUDIO_URL" label="VoiceStudio address" data={data} draft={draft} setDraft={setDraft} save={save} test={test} setTest={setTest} /></section><section><h3>Models</h3>{models.map(([name, label]) => <label className="field" key={name}>{label}<select value={draft[name] ?? currentValue(data, name)} onChange={e => void save(name, e.target.value)}><option value="">Other…</option>{data?.models.filter(m => m.id === currentValue(data, name) || name.toLowerCase().includes(m.provider)).map(m => <option key={m.id} value={m.id}>{m.id} {m.price ? `($${m.price.input}/1M in)` : ''}</option>)}<option value={currentValue(data, name)}>{currentValue(data, name)}</option></select><input placeholder="Other model id" value={draft[`${name}_other`] ?? ''} onChange={e => setDraft(d => ({ ...d, [`${name}_other`]: e.target.value }))} onBlur={e => { if (e.target.value) void save(name, e.target.value); }} /></label>)}</section><section><h3>Defaults</h3><label className="field">Voice provider<select value={currentValue(data, 'DEFAULT_TTS_PROVIDER')} onChange={e => void save('DEFAULT_TTS_PROVIDER', e.target.value)}><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="elevenlabs">ElevenLabs</option><option value="voicestudio">VoiceStudio</option></select></label><label className="field">Picture provider<select value={currentValue(data, 'DEFAULT_IMAGE_PROVIDER')} onChange={e => void save('DEFAULT_IMAGE_PROVIDER', e.target.value)}><option value="gemini">Gemini</option><option value="openai">OpenAI</option></select></label><label className="field">Vector drawing provider<select value={currentValue(data, 'VECTOR_DRAW_PROVIDER')} onChange={e => void save('VECTOR_DRAW_PROVIDER', e.target.value)}><option value="openai">OpenAI</option><option value="anthropic">Claude</option></select></label></section><section><h3>Admin</h3><button className="btn secondary" onClick={() => void enter(logout)}>Sign out</button><p className="hint">Reset locally with KITTA_ADMIN_RESET=1 once, or remove data/settings.json.</p></section></section></main>;
}

function currentValue(data: SettingsResponse | undefined, name: string) { return data?.settings[name]?.value ?? ''; }

function KeyRow({ name, label, data, draft, setDraft, save, test, setTest }: { name: string; label: string; data?: SettingsResponse; draft: Record<string,string>; setDraft: Dispatch<SetStateAction<Record<string,string>>>; save: (n:string,v:string|null)=>Promise<void>; test: Record<string,string>; setTest: Dispatch<SetStateAction<Record<string,string>>> }) {
  const item = data?.settings[name]; const value = draft[name] ?? ''; const provider = name.split('_')[0].toLowerCase();
  const runTest = () => { void testSettingProvider(provider, value || undefined).then(result => setTest(t => ({ ...t, [name]: result.message }))).catch(e => setTest(t => ({ ...t, [name]: e instanceof Error ? e.message : 'Test failed.' }))); };
  return <div className="settings-row">
    <label className="field">{label}<input type={name.endsWith('KEY') ? 'password' : 'text'} placeholder={item?.masked ?? (item?.source === 'env' ? 'Configured in .env' : 'Not configured')} value={value} onChange={e => setDraft(d => ({ ...d, [name]: e.target.value }))} /></label>
    <span className="hint">{item?.source === 'settings' ? 'From Settings' : item?.source === 'env' ? 'From .env' : item?.source === 'default' ? 'Built-in default' : 'Not configured'}</span>
    <div><button className="mini" disabled={!value} onClick={() => void save(name, value)}>Save</button><button className="mini" onClick={() => void save(name, null)}>Remove</button>{['openai','gemini','anthropic','elevenlabs','voicestudio'].includes(provider) && <button className="mini" onClick={runTest}>Test</button>}</div>
    {test[name] && <span className="hint" role="status">{test[name]}</span>}
  </div>;
}
