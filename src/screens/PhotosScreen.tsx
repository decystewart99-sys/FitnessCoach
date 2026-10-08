// Weekly progress photos: add this week's set, compare any two weeks, browse the timeline.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, updateSettings } from '../db';
import { useSettings } from '../hooks';
import type { PhotoPose, ProgressPhoto } from '../types';
import { POSES, POSE_LABEL, savePhoto } from '../lib/photos';
import { DAY_NAMES, formatDate, mondayOf, today } from '../lib/dates';
import { trendOn, weightTrend } from '../engine/adaptive';
import { formatWeight, formatWeightDelta } from '../lib/units';
import { Segmented } from '../components/ui';

function BlobImage({ blob, alt, style }: { blob: Blob; alt: string; style?: React.CSSProperties }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} style={{ display: 'block', width: '100%', borderRadius: 10, objectFit: 'cover', ...style }} /> : null;
}

export default function PhotosScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const photos = useLiveQuery(() => db.photos.orderBy('week').reverse().toArray(), []) ?? [];
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? [];
  const thisWeek = mondayOf(today());
  const [busy, setBusy] = useState<PhotoPose>();
  const [error, setError] = useState<string>();
  const [viewing, setViewing] = useState<ProgressPhoto>();

  const weeks = useMemo(() => [...new Set(photos.map((p) => p.week))], [photos]); // newest first
  const byWeek = (week: string, pose: PhotoPose) => photos.find((p) => p.week === week && p.pose === pose);
  const trend = useMemo(() => weightTrend(weights), [weights]);

  const [pose, setPose] = useState<PhotoPose>('front');
  const [weekA, setWeekA] = useState<string>();
  const [weekB, setWeekB] = useState<string>();
  const a = weekA ?? weeks[weeks.length - 1];
  const b = weekB ?? weeks[0];

  const add = async (p: PhotoPose, file: File | undefined) => {
    if (!file) return;
    setBusy(p);
    setError(undefined);
    try {
      await savePhoto(file, p, today());
    } catch {
      setError("Couldn't read that photo. Try taking it again, or pick a JPEG/HEIC from your library.");
    } finally {
      setBusy(undefined);
    }
  };

  const weightAt = (week: string) => {
    const date = photos.find((p) => p.week === week)?.date ?? week;
    return trendOn(trend, date);
  };

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>Progress photos</h1>
      <p className="small muted">Stored only on this phone. The scale can stall while your body is still changing – photos catch what it misses.</p>

      <h3 className="section-title">This week · {formatDate(thisWeek)}</h3>
      <div className="card">
        <div className="photo-grid">
          {POSES.map((p) => {
            const existing = byWeek(thisWeek, p);
            return (
              <label key={p} className="photo-slot">
                {existing ? <BlobImage blob={existing.blob} alt={`${POSE_LABEL[p]} this week`} style={{ aspectRatio: '3 / 4' }} /> : <span className="photo-empty">{busy === p ? '…' : '+'}</span>}
                <span className="small">{existing ? `${POSE_LABEL[p]} · replace` : `Add ${POSE_LABEL[p].toLowerCase()}`}</span>
                {/* No "capture" attribute: iPhone offers Take Photo or Photo Library. */}
                <input type="file" accept="image/*" hidden onChange={(e) => add(p, e.target.files?.[0])} />
              </label>
            );
          })}
        </div>
        {error && <div className="banner" style={{ marginTop: 10 }}>{error}</div>}
        <details className="explain" style={{ marginTop: 8 }}>
          <summary>Tips for comparable photos</summary>
          <p>
            Same place, same light, same time of day (morning, before eating), same clothes. Phone at chest height about 2 m away – a timer or a tripod helps. Relaxed, natural
            posture; side photo facing right.
          </p>
        </details>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="small grow">Weekly reminder on Today:</span>
          <select
            style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }}
            value={settings.photoDay ?? 6}
            onChange={(e) => updateSettings({ photoDay: Number(e.target.value) })}
            aria-label="Photo reminder day"
          >
            {DAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
            <option value={-1}>Off</option>
          </select>
        </div>
      </div>

      {weeks.length >= 2 && a && b && (
        <>
          <h3 className="section-title">Compare</h3>
          <div className="card">
            <Segmented value={pose} options={POSES.map((p) => ({ value: p, label: POSE_LABEL[p] }))} onChange={setPose} />
            <div className="compare-grid" style={{ marginTop: 12 }}>
              {[
                { week: a, set: setWeekA },
                { week: b, set: setWeekB },
              ].map(({ week, set }, i) => {
                const ph = byWeek(week, pose);
                const w = weightAt(week);
                return (
                  <div key={i}>
                    <select value={week} onChange={(e) => set(e.target.value)} style={{ minHeight: 36, padding: '4px 8px', marginBottom: 6 }} aria-label={i === 0 ? 'Before week' : 'After week'}>
                      {weeks.map((wk) => (
                        <option key={wk} value={wk}>
                          {formatDate(wk, { day: 'numeric', month: 'short', year: '2-digit' })}
                        </option>
                      ))}
                    </select>
                    {ph ? <BlobImage blob={ph.blob} alt={`${POSE_LABEL[pose]} week of ${week}`} style={{ aspectRatio: '3 / 4' }} /> : <div className="photo-empty" style={{ aspectRatio: '3 / 4' }}>No {pose} photo</div>}
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {w !== undefined ? `Trend ${formatWeight(w, settings.weightUnit)}` : 'No weigh-ins'}
                    </div>
                  </div>
                );
              })}
            </div>
            {weightAt(a) !== undefined && weightAt(b) !== undefined && (
              <p className="small" style={{ marginBottom: 0 }}>
                Change: <b>{formatWeightDelta(weightAt(b)! - weightAt(a)!, settings.weightUnit)}</b> trend weight between these weeks.
              </p>
            )}
          </div>
        </>
      )}

      <h3 className="section-title">Timeline</h3>
      <div className="card">
        {weeks.length === 0 && <p className="small muted" style={{ margin: 0 }}>Your weekly photos will appear here.</p>}
        {weeks.map((wk) => (
          <div key={wk} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="spread small" style={{ marginBottom: 6 }}>
              <b>Week of {formatDate(wk, { day: 'numeric', month: 'short', year: 'numeric' })}</b>
              <span className="muted">{weightAt(wk) !== undefined ? formatWeight(weightAt(wk)!, settings.weightUnit) : ''}</span>
            </div>
            <div className="photo-grid">
              {POSES.map((p) => {
                const ph = byWeek(wk, p);
                return ph ? (
                  <button key={p} className="photo-thumb" onClick={() => setViewing(ph)} aria-label={`View ${p} photo`}>
                    <BlobImage blob={ph.blob} alt={`${p} week of ${wk}`} style={{ aspectRatio: '3 / 4' }} />
                  </button>
                ) : (
                  <div key={p} className="photo-empty" style={{ aspectRatio: '3 / 4' }} />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <h3 className="section-title">Backups</h3>
      <div className="card">
        <label className="spread" style={{ cursor: 'pointer' }}>
          <span>
            <b>Include photos in backups</b>
            <span className="field-hint">
              {photos.length} photo{photos.length === 1 ? '' : 's'} ≈ {((photos.reduce((a2, p) => a2 + p.blob.size, 0) * 1.37) / 1_000_000).toFixed(1)} MB in a backup. Keep backups with photos somewhere
              private (e.g. your own iCloud Drive).
            </span>
          </span>
          <input type="checkbox" checked={!!settings.backupPhotos} onChange={(e) => updateSettings({ backupPhotos: e.target.checked })} style={{ width: 24, height: 24, flex: 'none' }} />
        </label>
      </div>

      {viewing && (
        <div className="sheet-backdrop" onClick={() => setViewing(undefined)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Photo">
            <div className="spread" style={{ marginBottom: 8 }}>
              <b>
                {POSE_LABEL[viewing.pose]} · {formatDate(viewing.date, { day: 'numeric', month: 'short', year: 'numeric' })}
              </b>
              <button className="icon-btn" aria-label="Close" onClick={() => setViewing(undefined)}>
                ×
              </button>
            </div>
            <BlobImage blob={viewing.blob} alt="Progress photo" />
            <button
              className="btn block danger"
              style={{ marginTop: 12 }}
              onClick={async () => {
                if (!confirm('Delete this photo?')) return;
                await db.photos.delete(viewing.id!);
                setViewing(undefined);
              }}
            >
              Delete photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
