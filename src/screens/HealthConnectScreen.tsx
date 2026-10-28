// Android: connect to Health Connect and see sync status.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateSettings } from '../db';
import { useSettings } from '../hooks';
import { HealthBridge, syncHealthConnect, type HCDiagnostic } from '../lib/healthConnect';
import { rescheduleReminders } from '../lib/notifications';

const APP_NAMES: Record<string, string> = {
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.myfitnesspal.android': 'MyFitnessPal',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.google.android.apps.fitness': 'Google Fit',
};
const appName = (pkg: string) => APP_NAMES[pkg] ?? pkg;

type Status = 'loading' | 'unavailable' | 'update_required' | 'not_connected' | 'partial' | 'connected';

export default function HealthConnectScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<HCDiagnostic[]>();

  const refresh = async () => {
    try {
      const a = await HealthBridge.availability();
      if (a.status !== 'available') return setStatus(a.status);
      const p = await HealthBridge.grantedPermissions();
      setStatus(p.all ? 'connected' : p.granted.length ? 'partial' : 'not_connected');
    } catch (e) {
      setStatus('unavailable');
      setMessage((e as Error).message);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await HealthBridge.requestHealthPermissions();
      if (r.granted.length) {
        await updateSettings({ healthConnect: true });
        const s = await syncHealthConnect();
        setMessage(s.message);
        await rescheduleReminders();
      } else {
        setMessage('No access was granted. If the permission screen didn\'t appear, open Health Connect settings below and allow Coach there.');
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      setMessage((await syncHealthConnect()).message);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>Health Connect</h1>
      <p className="muted small">
        Health Connect is Android's shared health store. Garmin Connect and MyFitnessPal write to it; Coach only reads from it – nothing is changed, uploaded or shared.
      </p>

      <div className="card">
        <div className="spread">
          <b>Status</b>
          <span className={`badge ${status === 'connected' ? 'accent' : status === 'partial' ? 'warn' : ''}`}>
            {
              {
                loading: 'Checking…',
                unavailable: 'Not available',
                update_required: 'Update needed',
                not_connected: 'Not connected',
                partial: 'Partly connected',
                connected: 'Connected',
              }[status]
            }
          </span>
        </div>
        {settings.lastHealthSyncAt && <p className="small muted" style={{ margin: '8px 0 0' }}>Last sync: {new Date(settings.lastHealthSyncAt).toLocaleString()}</p>}
        <div className="stack" style={{ marginTop: 12 }}>
          {(status === 'not_connected' || status === 'partial') && (
            <button className="btn primary block" disabled={busy} onClick={connect}>
              {status === 'partial' ? 'Allow the remaining data types' : 'Connect Health Connect'}
            </button>
          )}
          {(status === 'connected' || status === 'partial') && (
            <button className="btn block" disabled={busy} onClick={syncNow}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
          )}
          {status === 'update_required' && <p className="small">Update "Health Connect" from the Play Store, then come back.</p>}
          <button className="btn block" onClick={() => HealthBridge.openSettings().catch(() => setMessage('Open Settings → Health Connect on your phone.'))}>
            Open Health Connect settings
          </button>
        </div>
        {message && <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>{message}</div>}
      </div>

      <h3 className="section-title">Troubleshooting</h3>
      <div className="card">
        <p className="small" style={{ marginTop: 0 }}>
          Shows what Health Connect holds for the last 7 days, whether Coach is allowed to read it, and which app wrote it.
        </p>
        <button
          className="btn block"
          disabled={busy}
          onClick={async () => {
            try {
              setDiag((await HealthBridge.diagnostics()).types);
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Check what Health Connect has
        </button>
        {diag && (
          <div style={{ marginTop: 10 }}>
            {diag.map((d) => (
              <div className="list-row" key={d.type} style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div>{d.type}</div>
                  <div className="small muted">
                    {!d.granted
                      ? 'Coach is not allowed to read this – tap "Allow the remaining data types" above'
                      : d.error
                        ? `Error: ${d.error}`
                        : d.records
                          ? `From: ${(d.sources ?? []).map(appName).join(', ')}`
                          : 'Nothing in Health Connect for the last 7 days'}
                  </div>
                  {d.detail && <div className="small muted">{d.detail}</div>}
                </div>
                <span className={`badge ${!d.granted || d.error ? 'warn' : d.records ? 'accent' : ''}`}>{!d.granted ? 'No access' : d.error ? 'Error' : `${d.records ?? 0}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="section-title">What Coach reads</h3>
      <div className="card small">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li>
            <b>Food</b> – daily calories, protein, carbs and fat (from MyFitnessPal). Replaces that day's food entry.
          </li>
          <li>
            <b>Weight</b> – only on days you haven't weighed in yourself.
          </li>
          <li>
            <b>Runs</b> – distance, time and heart rate (from Garmin), matched to your planned runs.
          </li>
          <li>
            <b>Steps, resting heart rate and sleep</b> – for the Health screen and recovery warnings.
          </li>
        </ul>
        <p className="muted" style={{ marginBottom: 0 }}>Syncs automatically each time you open the app.</p>
      </div>

      <h3 className="section-title">One-time setup in your other apps</h3>
      <div className="card">
        <ol className="steps">
          <li>
            <b>Garmin Connect</b> → More (☰) → Settings → <b>Connected Apps</b> → <b>Health Connect</b> → allow it to write activities, steps, heart rate, sleep and weight.
          </li>
          <li>
            <b>MyFitnessPal</b> → More → <b>Apps &amp; Devices</b> → <b>Health Connect</b> → Connect, and allow nutrition.
          </li>
          <li>
            <b>Avoid double counting:</b> Samsung Health also records steps and sleep. In <b>Health Connect settings → Data and access</b> (or App priority), put <b>Garmin Connect</b> at the top for
            steps, sleep and heart rate.
          </li>
        </ol>
        <p className="small muted" style={{ marginBottom: 0 }}>Garmin's and MyFitnessPal's menus change now and then – if a step doesn't match, search their settings for "Health Connect".</p>
      </div>
    </div>
  );
}
