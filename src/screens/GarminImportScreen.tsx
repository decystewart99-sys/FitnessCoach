// Import runs from a Garmin Connect activities CSV, with a preview before anything is saved.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { useActivePhase, useSettings } from '../hooks';
import type { DistanceUnit, RunLog } from '../types';
import { isDuplicate, matchToPlan, parseGarminCsv, type GarminParse } from '../lib/garmin';
import { formatDate } from '../lib/dates';
import { formatDuration, formatPace, KM_PER_MI } from '../lib/units';
import { RUN_KIND_LABEL } from '../lib/runStats';
import { Segmented } from '../components/ui';

export default function GarminImportScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const phase = useActivePhase();
  const [text, setText] = useState<string>();
  const [unit, setUnit] = useState<DistanceUnit>(settings.distanceUnit);
  const [preview, setPreview] = useState<{ parse: GarminParse; fresh: RunLog[]; dupes: number }>();
  const [done, setDone] = useState<number>();

  const analyse = async (csv: string, u: DistanceUnit) => {
    const parse = parseGarminCsv(csv, u);
    const existing = await db.runs.toArray();
    const notDup = parse.runs.filter((r) => !existing.some((e) => isDuplicate(r, e)));
    setPreview({ parse, fresh: matchToPlan(phase ?? undefined, notDup, existing), dupes: parse.runs.length - notDup.length });
  };

  const mi = settings.distanceUnit === 'mi';
  const fmtDist = (km?: number) => (km ? `${(mi ? km / KM_PER_MI : km).toFixed(2)} ${settings.distanceUnit}` : '—');

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>Import from Garmin</h1>

      {done !== undefined ? (
        <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          <h3>Imported {done} run{done === 1 ? '' : 's'} ✓</h3>
          <button className="btn primary block" onClick={() => navigate('/runs')}>
            See runs
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <h3>1 · Export from Garmin Connect</h3>
            <ol className="steps">
              <li>
                In <b>Safari</b>, go to <b>connect.garmin.com</b> and sign in. (The Garmin Connect app can't export – use the website. If it shows the mobile page, tap <b>aA → Request
                Desktop Website</b>.)
              </li>
              <li>
                Open <b>Activities → All Activities</b>. Filter to <b>Running</b> if you like, and scroll down until the dates you want are loaded.
              </li>
              <li>
                Tap <b>Export CSV</b> (top right). It saves to <b>Files → Downloads</b>.
              </li>
            </ol>
            <p className="small muted" style={{ marginBottom: 0 }}>
              You can import the same file again later – runs already in the app are skipped.
            </p>
          </div>

          <div className="card">
            <h3>2 · Choose the file</h3>
            <label className="btn block">
              Choose CSV file…
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const csv = await f.text();
                  setText(csv);
                  await analyse(csv, unit);
                }}
              />
            </label>
            {text && (
              <div style={{ marginTop: 12 }}>
                <span className="small">Distances in that file are in:</span>
                <Segmented
                  value={unit}
                  options={[
                    { value: 'km', label: 'km' },
                    { value: 'mi', label: 'miles' },
                  ]}
                  onChange={(u) => {
                    setUnit(u);
                    analyse(text, u);
                  }}
                />
                <p className="small muted">Garmin uses your Garmin account's units. If the paces below look wrong, switch this.</p>
              </div>
            )}
          </div>

          {preview && (
            <div className="card">
              <h3>3 · Check and import</h3>
              {preview.parse.problems.map((p) => (
                <div className="banner" key={p}>
                  {p}
                </div>
              ))}
              <p className="small">
                {preview.fresh.length} new run{preview.fresh.length === 1 ? '' : 's'}
                {preview.dupes ? ` · ${preview.dupes} already in the app` : ''}
                {Object.keys(preview.parse.skipped).length
                  ? ` · skipped ${Object.entries(preview.parse.skipped)
                      .map(([t, n]) => `${n} ${t}`)
                      .join(', ')}`
                  : ''}
              </p>
              {preview.fresh.slice(0, 50).map((r, i) => (
                <div className="list-row" key={i}>
                  <div>
                    <div>
                      {RUN_KIND_LABEL[r.kind]} · {fmtDist(r.distanceKm)}
                      {r.sessionId && <span className="badge accent" style={{ marginLeft: 6 }}>Planned</span>}
                    </div>
                    <div className="small muted">{formatDate(r.date, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>{formatDuration(r.durationSec)}</div>
                    <div className="small muted">
                      {r.distanceKm ? formatPace(r.durationSec / r.distanceKm, settings.distanceUnit) : ''}
                      {r.avgHr ? ` · ${r.avgHr} bpm` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {preview.fresh.length > 50 && <p className="small muted">…and {preview.fresh.length - 50} more.</p>}
              <button
                className="btn primary block"
                style={{ marginTop: 12 }}
                disabled={!preview.fresh.length}
                onClick={async () => {
                  await db.runs.bulkAdd(preview.fresh);
                  setDone(preview.fresh.length);
                }}
              >
                Import {preview.fresh.length} run{preview.fresh.length === 1 ? '' : 's'}
              </button>
              <p className="small muted" style={{ marginBottom: 0 }}>
                Run types are guessed from Garmin titles ("intervals", "tempo", "long"…) or taken from your plan. You can edit any run afterwards.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
