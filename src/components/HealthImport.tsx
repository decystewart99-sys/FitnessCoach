// "Import from Health" button + the screen that handles import links.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { updateSettings } from '../db';
import { applyImport, extractParams, parseImport } from '../lib/healthImport';
import { formatDate, today } from '../lib/dates';

type Status = { kind: 'ok' | 'error'; text: string } | undefined;

export async function importFromText(text: string): Promise<Status> {
  const params = extractParams(text);
  if (!params) return { kind: 'error', text: "The clipboard doesn't contain shortcut data. Run the \"Coach import\" shortcut first, then try again." };
  const parsed = parseImport(params);
  if ('error' in parsed) return { kind: 'error', text: parsed.error };
  const done = await applyImport(parsed);
  await updateSettings({ lastHealthImportAt: new Date().toISOString() });
  return { kind: 'ok', text: `Imported ${done.join(' + ')} for ${parsed.date === today() ? 'today' : formatDate(parsed.date)}.` };
}

export function HealthImportButton() {
  const [status, setStatus] = useState<Status>();
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');

  const fromClipboard = async () => {
    setStatus(undefined);
    try {
      // iPhone shows a small "Paste" bubble the first time – tap it.
      const clip = await navigator.clipboard.readText();
      setStatus(await importFromText(clip));
    } catch {
      setManual(true);
      setStatus({ kind: 'error', text: "Couldn't read the clipboard automatically. Long-press the box below and tap Paste." });
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn block" onClick={fromClipboard}>
        ⤓ Import from Health
      </button>
      {manual && (
        <div className="inline-form" style={{ marginTop: 8 }}>
          <input type="text" placeholder="Paste here" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" disabled={!text} onClick={async () => setStatus(await importFromText(text))}>
            Import
          </button>
        </div>
      )}
      {status && (
        <div className="banner" role="status" style={{ marginTop: 8, marginBottom: 0, background: status.kind === 'ok' ? 'var(--accent-soft)' : undefined }}>
          {status.kind === 'ok' ? '✓ ' : ''}
          {status.text}
        </div>
      )}
    </div>
  );
}

/** Handles …/#/import?kcal=…&protein=… links (Android/desktop, or Safari on iPhone). */
export function ImportLinkScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>();

  useEffect(() => {
    importFromText(`fitnesscoach:${params.toString()}`).then(setStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page no-nav">
      <h1>Import</h1>
      {status ? <div className="banner">{status.text}</div> : <p className="muted">Importing…</p>}
      <button className="btn primary block" onClick={() => navigate('/', { replace: true })}>
        Done
      </button>
      <p className="small muted" style={{ marginTop: 12 }}>
        <Link to="/settings/health">How importing works</Link>
      </p>
    </div>
  );
}
