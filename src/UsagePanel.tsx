import { useEffect, useState } from 'react';
import type { UsageEntry, UsageReport, UsageRow, UsageTotals } from '../shared/usage';
import * as api from './api';

const NAMES = { gemini: 'Gemini', openai: 'OpenAI', voicestudio: 'VoiceStudio' } as const;
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Header button with this session's token total; opens a breakdown per provider and model.
 * refreshKey changes whenever an AI job ends, so the numbers follow along.
 */
export function UsagePanel({ refreshKey }: { refreshKey: unknown }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => Promise.resolve(api.usage()).then((r) => setReport(r ?? null), () => {});
  useEffect(() => { load(); }, [refreshKey, open]);

  const s = report?.session;
  return (
    <div className="usage">
      <button className="pill usage-pill" aria-expanded={open} onClick={() => setOpen(!open)} title="AI token usage">
        🔢 {s ? `${fmt(s.total)} tokens` : 'Usage'}
      </button>
      {open && report && (
        <div className="usage-panel" role="dialog" aria-label="AI usage">
          <Section title="This session" totals={report.session} rows={report.sessionRows} />
          <Section title="All time" totals={report.allTime} rows={report.allTimeRows} />
          {report.recent.length > 0 && (
            <>
              <h4>Latest calls</h4>
              <table><tbody>{report.recent.map((e, i) => <Recent key={i} e={e} />)}</tbody></table>
            </>
          )}
          <p className="hint">Token counts as reported by each provider. OpenAI speech and VoiceStudio don't report tokens, so those count as calls only.</p>
          <button className="mini" onClick={async () => { if (confirm('Reset all usage numbers?')) { await api.resetUsage(); load(); } }}>Reset</button>
        </div>
      )}
    </div>
  );
}

function Section({ title, totals, rows }: { title: string; totals: UsageTotals; rows: UsageRow[] }) {
  return (
    <>
      <h4>{title}: {fmt(totals.total)} tokens · {totals.calls} call{totals.calls === 1 ? '' : 's'}</h4>
      {rows.length === 0 ? <p className="hint">No AI calls yet.</p> : (
        <table>
          <thead><tr><th>Model</th><th>Calls</th><th>In</th><th>Out</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.provider}/${r.model}`}>
                <td>{NAMES[r.provider]} <span className="hint">{r.model}</span></td>
                <td>{r.calls}</td>
                <td>{fmt(r.input)}</td>
                <td>{fmt(r.output)}</td>
                <td>{r.unreported === r.calls ? 'n/a' : fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Recent({ e }: { e: UsageEntry }) {
  return (
    <tr>
      <td className="hint">{time(e.at)}</td>
      <td>{NAMES[e.provider]} {e.kind}</td>
      <td>{e.total === null ? 'n/a' : `${fmt(e.input ?? 0)} → ${fmt(e.output ?? 0)}`}</td>
    </tr>
  );
}
