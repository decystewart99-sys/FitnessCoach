// Export the plan to the iPhone Calendar (.ics) so sessions and reminders come with alerts.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActivePhase } from '../hooks';
import { buildIcs } from '../lib/ics';
import { getProgram } from '../lib/lifting';
import { today } from '../lib/dates';
import { Field, Segmented } from '../components/ui';

export default function CalendarScreen() {
  const navigate = useNavigate();
  const phase = useActivePhase();
  const [workoutTime, setWorkoutTime] = useState('18:00');
  const [runTime, setRunTime] = useState('07:00');
  const [alarm, setAlarm] = useState(30);
  const [weighIn, setWeighIn] = useState(true);
  const [weighTime, setWeighTime] = useState('07:00');
  const [checkin, setCheckin] = useState(true);
  const [status, setStatus] = useState<string>();
  if (!phase) return null;

  const make = async () => {
    const ics = buildIcs(phase, await getProgram(phase), {
      from: today(),
      workoutTime,
      runTime,
      alarmMinutes: alarm,
      weighIn: weighIn ? { time: weighTime } : undefined,
      checkin,
    });
    return new File([ics], 'coach-plan.ics', { type: 'text/calendar' });
  };

  const open = async () => {
    const file = await make();
    // Safari shows an "Add All" calendar prompt when it opens an .ics file.
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setStatus('If iPhone shows the events, tap "Add All". If it saved a file instead, use "Share file" below.');
  };

  const share = async () => {
    const file = await make();
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Coach plan' });
      } catch {
        /* cancelled */
      }
    } else setStatus('Sharing files isn\'t supported in this browser – use the button above.');
  };

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>Add plan to Calendar</h1>
      <p className="muted small">
        Puts your planned sessions (with exercises and run details) into your iPhone Calendar with alerts, from today to the end of the phase.
      </p>

      <div className="card">
        <div className="row">
          <div className="grow">
            <Field label="Lifting sessions at">
              <input type="time" value={workoutTime} onChange={(e) => setWorkoutTime(e.target.value || '18:00')} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Runs at">
              <input type="time" value={runTime} onChange={(e) => setRunTime(e.target.value || '07:00')} />
            </Field>
          </div>
        </div>
        <Field label="Alert before each session">
          <Segmented
            value={alarm}
            options={[
              { value: 0, label: 'None' },
              { value: 15, label: '15 min' },
              { value: 30, label: '30 min' },
              { value: 60, label: '1 hour' },
            ]}
            onChange={setAlarm}
          />
        </Field>
        <label className="spread" style={{ padding: '8px 0' }}>
          <span>Daily weigh-in reminder</span>
          <input type="checkbox" checked={weighIn} onChange={(e) => setWeighIn(e.target.checked)} style={{ width: 24, height: 24 }} />
        </label>
        {weighIn && (
          <Field label="Weigh-in reminder at">
            <input type="time" value={weighTime} onChange={(e) => setWeighTime(e.target.value || '07:00')} />
          </Field>
        )}
        <label className="spread" style={{ padding: '8px 0' }}>
          <span>Weekly check-in reminder (start of each week, 08:00)</span>
          <input type="checkbox" checked={checkin} onChange={(e) => setCheckin(e.target.checked)} style={{ width: 24, height: 24, flex: 'none' }} />
        </label>
      </div>

      <button className="btn primary block" style={{ marginTop: 12 }} onClick={open}>
        Add to Calendar
      </button>
      <button className="btn block" style={{ marginTop: 8 }} onClick={share}>
        Share file…
      </button>
      {status && <div className="banner" style={{ marginTop: 12 }}>{status}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Good to know</h3>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>When asked, add the events to a separate calendar (e.g. create one called "Coach") – then you can hide or delete them all at once.</li>
          <li>Events don't update by themselves. After moving sessions or a check-in that adds a deload, delete the Coach calendar and export again.</li>
          <li>Each lifting event lists the exercises; open the app for today's exact weights and reps.</li>
        </ul>
      </div>
    </div>
  );
}
