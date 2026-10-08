// Shows the generated phase, lets the user tweak it, then saves it as the active phase.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { activatePhase, getActivePhase, getSettings, updateSettings } from '../db';
import { useSettings } from '../hooks';
import type { Phase, PhaseOptions } from '../types';
import { generatePhase } from '../engine/phase';
import { nextMonday } from '../lib/dates';
import PhaseDetails from '../components/PhaseDetails';
import { isCompleteProfile, type Draft } from './Onboarding';

export default function Review() {
  const settings = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft>();
  const [active, setActive] = useState<Phase | null>(null);
  const [options, setOptions] = useState<PhaseOptions>({ startDate: nextMonday() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      const a = (await getActivePhase()) ?? null;
      setDraft(s.draftProfile);
      setActive(a);
      if (params.get('edit') && a) setOptions({ ...a.options, startDate: a.startDate });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = useMemo(() => (draft && isCompleteProfile(draft) ? generatePhase(draft, options) : undefined), [draft, options]);

  if (draft === undefined && !phase) return null;
  if (!phase) {
    return (
      <div className="page no-nav">
        <h1>Almost there</h1>
        <p>Some answers are missing.</p>
        <button className="btn primary" onClick={() => navigate('/setup')}>
          Back to questions
        </button>
      </div>
    );
  }

  const save = async (replace: boolean) => {
    setSaving(true);
    await activatePhase(phase, replace && active?.id !== undefined ? active.id : undefined);
    await updateSettings({ draftProfile: undefined });
    navigate('/', { replace: true });
  };

  return (
    <div className="page no-nav">
      <p className="small muted">Your plan</p>
      <h1>Review your phase</h1>
      <p className="muted">Check everything below. You can change the start date, length, calories and which day each session falls on.</p>
      <PhaseDetails phase={phase} settings={settings} edit={{ options, setOptions }} />

      <div className="step-footer" style={{ flexDirection: 'column' }}>
        {active && params.get('edit') ? (
          <>
            <button className="btn primary block" disabled={saving} onClick={() => save(true)}>
              Update current phase
            </button>
            <button className="btn block" disabled={saving} onClick={() => save(false)}>
              Start as a new phase
            </button>
          </>
        ) : (
          <button className="btn primary block" disabled={saving} onClick={() => save(false)}>
            Confirm and start
          </button>
        )}
        <button className="btn block" onClick={() => navigate(`/setup?step=1${params.get('edit') ? '&edit=1' : ''}`)}>
          Change my answers
        </button>
      </div>
    </div>
  );
}
