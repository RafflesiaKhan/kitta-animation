import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { authStatus, getSettings, login, logout, resetUsage, setupPassword, testSettingProvider, updateSettings, usageHistory, type SettingsResponse } from './api';
import type { UsageHistory } from '../shared/usage';

const keys = [['OPENAI_API_KEY', 'OpenAI'], ['GEMINI_API_KEY', 'Gemini'], ['ANTHROPIC_API_KEY', 'Anthropic'], ['ELEVENLABS_API_KEY', 'ElevenLabs'], ['VOICESTUDIO_API_KEY', 'VoiceStudio API key'], ['VOICESTUDIO_URL', 'VoiceStudio address']] as const;
/** Model fields grouped by the job they do in Kitta. */
const modelGroups = [
  ['Directions and text', 'text', [['OPENAI_TEXT_MODEL', 'OpenAI'], ['GEMINI_TEXT_MODEL', 'Gemini']]],
  ['Pictures', 'image', [['OPENAI_IMAGE_MODEL', 'OpenAI'], ['GEMINI_IMAGE_MODEL', 'Gemini']]],
  ['Voice', 'voice', [['OPENAI_TTS_MODEL', 'OpenAI'], ['GEMINI_TTS_MODEL', 'Gemini'], ['ELEVENLABS_MODEL', 'ElevenLabs'], ['VOICESTUDIO_TTS_MODEL', 'VoiceStudio']]],
  ['Mouth lookup', 'mouth', [['OPENAI_VISION_MODEL', 'OpenAI']]],
  ['Vector drawing', 'vector', [['OPENAI_DRAW_MODEL', 'OpenAI'], ['ANTHROPIC_MODEL', 'Claude']]],
] as const;
const providers = ['gemini', 'openai', 'anthropic', 'elevenlabs', 'voicestudio'] as const;
const providerNames = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude', elevenlabs: 'ElevenLabs', voicestudio: 'VoiceStudio' } as const;
const providerColors = { gemini: '#4285f4', openai: '#10a37f', anthropic: '#d97757', elevenlabs: '#8b5cf6', voicestudio: '#8a8580' } as const;
const useNames = { voice: 'Voice', image: 'Pictures', 'auto-tag': 'Directions', direct: 'Directions', mouth: 'Mouth lookup', draw: 'Vector drawing', transcribe: 'Voice' } as const;
const money = (n: number) => n === 0 ? '$0' : n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString('en-US');

type Save = (name: string, value: string | null) => Promise<void>;
type Drafts = { draft: Record<string, string>; setDraft: Dispatch<SetStateAction<Record<string, string>>> };

function Shell({ children, onSignOut }: { children: ReactNode; onSignOut?: () => void }) {
  return <>
    <header className="settings-bar">
      <div className="logo" aria-hidden="true">K</div>
      <div className="brand"><h1>Kitta Animation</h1><span className="tagline">Settings</span></div>
      <nav className="settings-nav"><a className="pill" href="/">Back to Studio</a>{onSignOut && <button className="pill" onClick={onSignOut}>Sign out</button>}</nav>
    </header>
    <main className="settings-main">{children}</main>
  </>;
}

export function Settings() {
  const [status, setStatus] = useState<{ configured: boolean; authenticated: boolean }>();
  const [data, setData] = useState<SettingsResponse>();
  const [history, setHistory] = useState<UsageHistory>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, boolean>>({});
  const [test, setTest] = useState<Record<string, string>>({});
  async function load() { const s = await authStatus(); setStatus(s); if (s.authenticated) { const [next, usage] = await Promise.all([getSettings(), usageHistory(30)]); setData(next); setHistory(usage); } }
  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : 'Could not load Settings.')); }, []);
  async function enter(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); setPassword(''); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); } finally { setBusy(false); } }
  const save: Save = async (name, value) => { await enter(async () => { const next = await updateSettings({ [name]: value }); setData(next); setDraft(d => { const copy = { ...d }; delete copy[name]; return copy; }); }); };

  if (!status) return <Shell><section className="panel settings-gate">{error ? <p className="error" role="alert">{error}</p> : <p role="status">Loading Settings…</p>}</section></Shell>;

  if (!status.authenticated) return <Shell>
    <section className="panel settings-gate">
      <h2>{status.configured ? 'Sign in to Settings' : 'Create an admin password'}</h2>
      <p className="hint">{status.configured ? 'Settings holds your keys, so it has its own password.' : 'This password protects your saved keys and model choices on this computer. Use at least 8 characters.'}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={e => { e.preventDefault(); void enter(() => status.configured ? login(password) : setupPassword(password)); }}>
        <label className="field">Admin password<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoFocus /></label>
        <button className="btn" disabled={busy || password.length < 8}>{status.configured ? 'Sign in' : 'Create password'}</button>
      </form>
      {status.configured && <p className="hint settings-forgot">Forgot it? Start Kitta once with KITTA_ADMIN_RESET=1 to choose a new one.</p>}
    </section>
  </Shell>;

  const drafts = { draft, setDraft };
  return <Shell onSignOut={() => void enter(logout)}>
    <div className="settings-head">
      <h2>Settings</h2>
      <p className="hint">Keys and model choices for Kitta on this computer. Keys stay on the server: this page only shows whether each one is set.</p>
    </div>
    {error && <p className="error" role="alert">{error}</p>}

    <Section title="Keys" note="A key saved here is used instead of the one in .env. Remove it to go back to .env.">
      {keys.map(([name, label]) => <KeyRow key={name} name={name} label={label} data={data} {...drafts} save={save} test={test} setTest={setTest} />)}
    </Section>

    <Section title="Models" note="Which model does each job. Prices are per million input tokens.">
      <div className="model-groups">
        {modelGroups.map(([title, job, fields]) => <fieldset key={title} className="model-group">
          <legend>{title}</legend>
          {fields.map(([name, label]) => <ModelRow key={name} name={name} label={label} group={title} job={job} data={data} {...drafts} save={save} other={other} setOther={setOther} />)}
        </fieldset>)}
      </div>
    </Section>

    <Section title="Defaults" note="The provider a new line, picture or drawing starts with.">
      <div className="defaults-grid">
        <label className="field">Voice<select value={currentValue(data, 'DEFAULT_TTS_PROVIDER')} onChange={e => void save('DEFAULT_TTS_PROVIDER', e.target.value)}><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="elevenlabs">ElevenLabs</option><option value="voicestudio">VoiceStudio</option></select></label>
        <label className="field">Pictures<select value={currentValue(data, 'DEFAULT_IMAGE_PROVIDER')} onChange={e => void save('DEFAULT_IMAGE_PROVIDER', e.target.value)}><option value="gemini">Gemini</option><option value="openai">OpenAI</option></select></label>
        <label className="field">Vector drawing<select value={currentValue(data, 'VECTOR_DRAW_PROVIDER')} onChange={e => void save('VECTOR_DRAW_PROVIDER', e.target.value)}><option value="openai">OpenAI</option><option value="anthropic">Claude</option></select></label>
      </div>
    </Section>

    <UsageSection history={history} onReset={() => void enter(async () => { await resetUsage(); setHistory(await usageHistory(30)); })} />
  </Shell>;
}

function Section({ title, note, action, children }: { title: string; note: string; action?: ReactNode; children: ReactNode }) {
  return <section className="panel settings-section">
    <div className="settings-section-intro"><h3>{title}</h3><p className="hint">{note}</p>{action}</div>
    <div className="settings-section-body">{children}</div>
  </section>;
}

function currentValue(data: SettingsResponse | undefined, name: string) { return data?.settings[name]?.value ?? ''; }
function sourceLabel(source: string | undefined) { return source === 'env' ? 'Set in .env' : source === 'settings' ? 'Saved in Kitta' : source === 'default' ? 'Default' : 'Not set'; }

function KeyRow({ name, label, data, draft, setDraft, save, test, setTest }: { name: string; label: string; data?: SettingsResponse; save: Save; test: Record<string, string>; setTest: Dispatch<SetStateAction<Record<string, string>>> } & Drafts) {
  const item = data?.settings[name]; const value = draft[name] ?? ''; const isKey = name.endsWith('KEY'); const provider = name.split('_')[0].toLowerCase(); const id = `setting-${name}`;
  const runTest = () => { setTest(t => ({ ...t, [name]: 'Testing…' })); void testSettingProvider(provider, value || undefined).then(r => setTest(t => ({ ...t, [name]: r.message }))).catch(e => setTest(t => ({ ...t, [name]: e instanceof Error ? e.message : 'Test failed.' }))); };
  return <div className="key-row">
    <div className="key-row-head"><label htmlFor={id}>{label}</label><span className={`source source-${item?.source ?? 'unset'}`}>{sourceLabel(item?.source)}</span></div>
    <div className="key-row-controls">
      <input id={id} type={isKey ? 'password' : 'text'} autoComplete="off" placeholder={isKey ? (item?.configured ? 'Enter a new key to replace it' : 'Paste a key') : currentValue(data, name) || 'Enter an address'} value={value} onChange={e => setDraft(d => ({ ...d, [name]: e.target.value }))} />
      <button className="mini" disabled={!value} onClick={() => void save(name, value)}>Save</button>
      <button className="mini" onClick={runTest}>Test</button>
      {item?.source === 'settings' && <button className="mini" onClick={() => void save(name, null)}>Remove</button>}
    </div>
    {test[name] && <p className="hint key-row-test" role="status">{test[name]}</p>}
  </div>;
}

function ModelRow({ name, label, group, job, data, draft, setDraft, save, other, setOther }: { name: string; label: string; group: string; job: string; data?: SettingsResponse; save: Save; other: Record<string, boolean>; setOther: Dispatch<SetStateAction<Record<string, boolean>>> } & Drafts) {
  const current = currentValue(data, name); const isOther = other[name] ?? (!!current && !data?.catalog.some(m => m.id === current));
  const options = useMemo(() => { const all = data?.catalog.filter(m => m.jobs.includes(job as never) && m.provider !== 'voicestudio') ?? []; const ids = new Set(all.map(m => m.id)); if (current && !ids.has(current)) all.push({ id: current, provider: 'openai', jobs: [], price: null }); return all; }, [data, current, job]);
  const source = data?.settings[name]?.source;
  return <label className="field model-field">
    <span className="model-label">{label}{source === 'settings' && <span className="source source-settings">Saved</span>}</span>
    <select aria-label={`${label} model for ${group.toLowerCase()}`} value={isOther ? '__other__' : current} onChange={e => { if (e.target.value === '__other__') setOther(o => ({ ...o, [name]: true })); else { setOther(o => ({ ...o, [name]: false })); void save(name, e.target.value || null); } }}>
      <option value="">Not set (use default)</option>
      {options.map(m => <option key={m.id} value={m.id}>{m.id}{m.price ? `  ($${m.price.input.toFixed(2)})` : ''}</option>)}
      <option value="__other__">Other…</option>
    </select>
    {isOther && <input placeholder="Enter model id" value={draft[name] ?? current} onChange={e => setDraft(d => ({ ...d, [name]: e.target.value }))} onBlur={e => { if (e.target.value) void save(name, e.target.value); }} />}
  </label>;
}

function UsageSection({ history, onReset }: { history?: UsageHistory; onReset: () => void }) {
  const [mode, setMode] = useState<'cost' | 'tokens'>('cost');
  const reset = <button className="mini" onClick={() => { if (confirm('Reset all usage numbers? This can’t be undone.')) onReset(); }}>Reset usage</button>;
  if (!history) return <Section title="Usage and cost" note="The last 30 days."><p className="hint">Loading usage…</p></Section>;
  const value = (n: { cost: number; tokens: number }) => mode === 'cost' ? n.cost : n.tokens;
  const max = Math.max(...history.days.map(value), 0);
  const used = providers.filter(p => history.days.some(d => d.providers[p].cost || d.providers[p].tokens));
  const rows = [...history.kindRows].sort((a, b) => b.cost - a.cost || b.total - a.total);
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return <Section title="Usage and cost" note="What Kitta’s calls cost over the last 30 days, from the providers’ published prices. Your bill is the final word." action={history.totals.calls > 0 ? reset : undefined}>
    <div className="usage-summary">
      <p className="usage-total">{history.totals.estimated ? '≈' : ''}{money(history.totals.cost)}</p>
      <p className="hint">{count(history.totals.calls)} calls and {count(history.totals.total)} tokens in the last 30 days</p>
    </div>
    {history.totals.calls === 0 ? <p className="usage-empty">No calls yet in the last 30 days. Voices, pictures, directions and drawings you make will show up here with their cost.</p> : <>
      <div className="usage-toolbar">
        <div className="usage-switch" role="group" aria-label="Chart shows">
          <button className={`mini${mode === 'cost' ? ' selected' : ''}`} aria-pressed={mode === 'cost'} onClick={() => setMode('cost')}>Cost</button>
          <button className={`mini${mode === 'tokens' ? ' selected' : ''}`} aria-pressed={mode === 'tokens'} onClick={() => setMode('tokens')}>Tokens</button>
        </div>
        <ul className="usage-legend">{used.map(p => <li key={p}><span style={{ background: providerColors[p] }} />{providerNames[p]}</li>)}</ul>
      </div>
      <div className="usage-chart-wrap">
        <svg className="usage-chart" viewBox="0 0 720 200" role="img" aria-label={`Daily ${mode} for the last 30 days`}>
          <text x="0" y="10" className="usage-axis">{mode === 'cost' ? money(max) : count(max)}</text>
          <line x1="0" y1="20" x2="720" y2="20" className="usage-grid" />
          <line x1="0" y1="176" x2="720" y2="176" className="usage-base" />
          {history.days.map((d, i) => { let y = 176; return <g key={d.date} transform={`translate(${i * 24},0)`}>
            {providers.map(p => { const n = value(d.providers[p]); const h = max ? n / max * 156 : 0; y -= h; return h > 0 && <rect key={p} x="3" y={y} width="18" height={h} rx="2" fill={providerColors[p]}><title>{`${label(d.date)}: ${providerNames[p]} ${mode === 'cost' ? money(n) : count(n)}${d.providers[p].estimated ? ' (≈)' : ''}`}</title></rect>; })}
            {i % 7 === 0 && <text x="3" y="194" className="usage-axis">{label(d.date)}</text>}
          </g>; })}
        </svg>
      </div>
      <table className="usage-table">
        <thead><tr><th>Use</th><th>Provider and model</th><th className="num">Calls</th><th className="num usage-tokens">Tokens</th><th className="num">Cost</th></tr></thead>
        <tbody>{rows.map(r => <tr key={`${r.provider}/${r.model}/${r.kind}`}><td>{useNames[r.kind]}</td><td>{providerNames[r.provider]} <span className="hint">{r.model}</span></td><td className="num">{count(r.calls)}</td><td className="num usage-tokens">{count(r.total)}</td><td className="num">{r.estimated ? '≈' : ''}{money(r.cost)}</td></tr>)}</tbody>
      </table>
    </>}
  </Section>;
}
