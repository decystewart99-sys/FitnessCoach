import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, requestPersistence, updateSettings } from '../db';
import { useActivePhase, useSettings } from '../hooks';
import { Field, Segmented } from '../components/ui';
import { exportBackup, readBackupFile, restoreBackup, summarizeBackup } from '../lib/backup';

export default function SettingsScreen() {
  const settings = useSettings();
  const phase = useActivePhase();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [persisted, setPersisted] = useState<boolean>();

  useEffect(() => {
    requestPersistence().then(setPersisted);
  }, []);

  const doExport = async () => {
    const r = await exportBackup();
    if (r !== 'cancelled') setMessage(r === 'shared' ? 'Backup saved.' : 'Backup downloaded.');
  };

  const doImport = async (file: File) => {
    try {
      const data = await readBackupFile(file);
      if (!confirm(`${summarizeBackup(data)}\n\nThis replaces ALL data on this device. Continue?`)) return;
      await restoreBackup(data);
      setMessage('Backup restored.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const redo = async () => {
    await updateSettings({ draftProfile: phase?.profile });
    navigate('/setup?edit=1');
  };

  const wipe = async () => {
    if (!confirm('Delete ALL data on this device? This cannot be undone. Make a backup first if you might want it.')) return;
    if (!confirm('Really delete everything?')) return;
    await Promise.all(db.tables.map((t) => t.clear()));
    navigate('/setup', { replace: true });
  };

  return (
    <div className="page">
      <h1>Settings</h1>

      <h3 className="section-title">Units</h3>
      <div className="card">
        <Field label="Body weight">
          <Segmented
            value={settings.weightUnit}
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'stlb', label: 'st & lb' },
              { value: 'lb', label: 'lb' },
            ]}
            onChange={(weightUnit) => updateSettings({ weightUnit })}
          />
        </Field>
        <Field label="Height and measurements">
          <Segmented
            value={settings.heightUnit}
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'ftin', label: 'ft & in' },
            ]}
            onChange={(heightUnit) => updateSettings({ heightUnit })}
          />
        </Field>
        <Field label="Running distance & pace">
          <Segmented
            value={settings.distanceUnit}
            options={[
              { value: 'km', label: 'km' },
              { value: 'mi', label: 'miles' },
            ]}
            onChange={(distanceUnit) => updateSettings({ distanceUnit })}
          />
        </Field>
      </div>

      <h3 className="section-title">Plan</h3>
      <div className="card stack">
        <button className="btn block" onClick={redo}>
          Redo the questionnaire
        </button>
        <p className="small muted">Your current answers are filled in. At the end you can update the current phase or start a new one.</p>
      </div>

      <h3 className="section-title">Connections</h3>
      <div className="card stack">
        <button className="btn block" onClick={() => navigate('/settings/health')}>
          Import from MyFitnessPal / Apple Health
        </button>
        <p className="small muted">
          {settings.lastHealthImportAt ? `Last import: ${new Date(settings.lastHealthImportAt).toLocaleString()}` : 'Set up an iPhone Shortcut to bring in food totals and weight.'}
        </p>
      </div>

      <h3 className="section-title">Backup</h3>
      <div className="card stack">
        <p className="small">
          All your data lives only on this phone. If you delete the app from your home screen or clear Safari's website data, it's gone – so save a backup
          regularly (e.g. to iCloud Drive via "Save to Files").
        </p>
        <p className="small muted">Last backup: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'never'}</p>
        <button className="btn primary block" onClick={doExport}>
          Save a backup
        </button>
        <button className="btn block" onClick={() => fileRef.current?.click()}>
          Restore from a backup…
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        {message && <div className="banner">{message}</div>}
        {persisted === false && (
          <p className="small muted">Tip: add this app to your home screen (Share → Add to Home Screen) – iPhone keeps home-screen apps' data more reliably.</p>
        )}
      </div>

      <h3 className="section-title">About</h3>
      <div className="card stack">
        <p className="small muted">Version built {new Date(__BUILD_TIME__).toLocaleString()}</p>
        <button className="btn block" onClick={() => location.reload()}>
          Check for updates
        </button>
        <button className="btn block danger" onClick={wipe}>
          Delete all data
        </button>
      </div>
    </div>
  );
}
