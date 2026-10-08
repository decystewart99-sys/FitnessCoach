// The setup questionnaire: one topic per screen. Answers are saved as a draft after
// every step, so closing the app half-way doesn't lose them.

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getActivePhase, getSettings, updateSettings } from '../db';
import { useSettings } from '../hooks';
import type { Goal, HomeEquip, InjuryArea, Profile, Settings } from '../types';
import { Chips, DayPicker, DurationInput, Field, HeightInput, LengthInput, NumberInput, OptionList, RankList, Segmented, WeightInput } from '../components/ui';
import { formatWeightDelta, KM_PER_MI } from '../lib/units';
import { today } from '../lib/dates';

export type Draft = Partial<Profile>;

const DEFAULT_DRAFT: Draft = {
  goalRanking: ['fat', 'run', 'muscle'],
  weeklyLossPct: 0.5,
  runGoal: { kind: 'none' },
  trainingDays: [],
  allowDoubles: false,
  sessionMinutes: 60,
  equipment: 'gym',
  homeEquipment: [],
  injuries: [],
  injuryNotes: '',
  mealsPerDay: 3,
  nutritionMode: 'calories_protein',
};

export const GOAL_LABEL: Record<Goal, string> = { fat: 'Lose fat', run: 'Improve my running', muscle: 'Build / keep muscle' };

interface StepProps {
  d: Draft;
  set: (patch: Draft) => void;
  settings: Settings;
}

interface Step {
  title: string;
  intro?: string;
  render: (p: StepProps) => ReactNode;
  validate?: (d: Draft) => string | undefined;
}

const STEPS: Step[] = [
  {
    title: 'Welcome',
    intro:
      'A few quick questions and the app will build your first training phase: calories, protein, a strength programme and a running plan. You can change any answer later.',
    render: ({ settings }) => (
      <>
        <p className="muted">First, which units do you prefer? (You can change these in Settings too.)</p>
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
        <Field label="Running distance">
          <Segmented
            value={settings.distanceUnit}
            options={[
              { value: 'km', label: 'km' },
              { value: 'mi', label: 'miles' },
            ]}
            onChange={(distanceUnit) => updateSettings({ distanceUnit })}
          />
        </Field>
      </>
    ),
  },
  {
    title: 'About you',
    render: ({ d, set, settings }) => (
      <>
        <Field label="Age">
          <NumberInput value={d.age} onChange={(age) => set({ age })} suffix="years" />
        </Field>
        <Field label="Sex" hint="Used for the calorie formula.">
          <Segmented
            value={d.sex}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
            onChange={(sex) => set({ sex })}
          />
        </Field>
        <Field label="Height">
          <HeightInput cm={d.heightCm} onChange={(heightCm) => set({ heightCm })} unit={settings.heightUnit} />
        </Field>
        <Field label="Current weight" hint="Ideally first thing in the morning, after the toilet.">
          <WeightInput kg={d.weightKg} onChange={(weightKg) => set({ weightKg })} unit={settings.weightUnit} />
        </Field>
        <Field label="Body fat % (optional)" hint="Only if you have a reasonable estimate (e.g. smart scale, DEXA). Leave blank if unsure.">
          <NumberInput value={d.bodyFatPct} onChange={(bodyFatPct) => set({ bodyFatPct })} suffix="%" step={0.5} />
        </Field>
        <Field label="Waist (optional)" hint="Measured around the belly button, relaxed. Helps estimate body fat.">
          <LengthInput cm={d.waistCm} onChange={(waistCm) => set({ waistCm })} unit={settings.heightUnit} />
        </Field>
      </>
    ),
    validate: (d) => {
      if (!d.age || d.age < 16 || d.age > 90) return 'Please enter your age (16–90).';
      if (!d.sex) return 'Please choose a sex for the calorie formula.';
      if (!d.heightCm || d.heightCm < 120 || d.heightCm > 230) return 'Please enter a valid height.';
      if (!d.weightKg || d.weightKg < 35 || d.weightKg > 300) return 'Please enter a valid weight.';
      if (d.bodyFatPct !== undefined && (d.bodyFatPct < 4 || d.bodyFatPct > 60)) return 'Body fat % looks off – leave it blank if unsure.';
    },
  },
  {
    title: 'Daily activity',
    intro: 'Not counting workouts – just your job and everyday movement.',
    render: ({ d, set }) => (
      <>
        <Field label="Your typical day">
          <OptionList
            value={d.jobActivity}
            onChange={(jobActivity) => set({ jobActivity })}
            options={[
              { value: 'sedentary', label: 'Mostly sitting', hint: 'Desk job, drive to work' },
              { value: 'light', label: 'Lightly active', hint: 'Some walking, on your feet part of the day' },
              { value: 'active', label: 'Active', hint: 'On your feet most of the day (retail, nursing, teaching)' },
              { value: 'very_active', label: 'Very active', hint: 'Physical work (construction, labouring)' },
            ]}
          />
        </Field>
        <Field label="Average daily steps (optional)" hint="From your phone or Garmin. If you enter this, it's used instead of the description above.">
          <NumberInput value={d.avgSteps} onChange={(avgSteps) => set({ avgSteps })} suffix="steps" />
        </Field>
      </>
    ),
    validate: (d) => (!d.jobActivity ? 'Please pick the option closest to your typical day.' : undefined),
  },
  {
    title: 'Your goals',
    render: ({ d, set, settings }) => {
      const kg = d.weightKg ?? 80;
      const rates = [0.25, 0.5, 0.75, 1.0];
      return (
        <>
          <Field label="Rank your goals" hint="Use the arrows. This decides where the plan puts its emphasis.">
            <RankList items={d.goalRanking ?? []} labels={GOAL_LABEL} onChange={(goalRanking) => set({ goalRanking })} />
          </Field>
          <Field label="Target weight (optional)">
            <WeightInput kg={d.targetWeightKg} onChange={(targetWeightKg) => set({ targetWeightKg })} unit={settings.weightUnit} />
          </Field>
          <Field label="How fast do you want to lose weight?" hint="Slower keeps more muscle and makes training feel better. The app never goes faster than 1% per week.">
            <OptionList
              value={d.weeklyLossPct}
              onChange={(weeklyLossPct) => set({ weeklyLossPct })}
              options={rates.map((r) => ({
                value: r,
                label: `${{ 0.25: 'Gentle', 0.5: 'Moderate (recommended)', 0.75: 'Faster', 1: 'Aggressive' }[r]} – ${r}% per week`,
                hint: `About ${formatWeightDelta((-r / 100) * kg, settings.weightUnit, 2)} per week right now`,
              }))}
            />
          </Field>
        </>
      );
    },
    validate: (d) => {
      if (d.targetWeightKg !== undefined && d.weightKg && d.targetWeightKg >= d.weightKg) return 'Target weight should be below your current weight (or leave it blank).';
    },
  },
  {
    title: 'Running goal',
    render: ({ d, set }) => {
      const rg = d.runGoal ?? { kind: 'none' };
      return (
        <>
          <Field label="What are you working toward?">
            <OptionList
              value={rg.kind}
              onChange={(kind) => set({ runGoal: { ...rg, kind } })}
              options={[
                { value: 'none', label: 'No specific goal', hint: 'Just get fitter and run better' },
                { value: '5k', label: '5k', hint: 'First 5k, or a faster one' },
                { value: '10k', label: '10k' },
                { value: 'half', label: 'Half marathon' },
                { value: 'marathon', label: 'Marathon' },
              ]}
            />
          </Field>
          {rg.kind !== 'none' && (
            <>
              <Field label="Target time (optional)" hint="Leave blank if the goal is just to finish.">
                <DurationInput seconds={rg.targetTimeSec} onChange={(targetTimeSec) => set({ runGoal: { ...rg, targetTimeSec } })} placeholder="e.g. 29:59 or 2:15:00" />
              </Field>
              <Field label="Race date (optional)">
                <input type="date" value={rg.raceDate ?? ''} min={today()} onChange={(e) => set({ runGoal: { ...rg, raceDate: e.target.value || undefined } })} />
              </Field>
            </>
          )}
        </>
      );
    },
    validate: (d) => (d.runGoal?.raceDate && d.runGoal.raceDate < today() ? 'The race date is in the past.' : undefined),
  },
  {
    title: 'Training background',
    render: ({ d, set, settings }) => {
      const mi = settings.distanceUnit === 'mi';
      return (
        <>
          <Field label="Weight-lifting experience">
            <OptionList
              value={d.liftExperience}
              onChange={(liftExperience) => set({ liftExperience })}
              options={[
                { value: 'beginner', label: 'Beginner', hint: 'New to lifting, or less than ~1 year of consistent training' },
                { value: 'intermediate', label: 'Intermediate', hint: '1–3 years consistent; know the main lifts well' },
                { value: 'advanced', label: 'Advanced', hint: '3+ years; progress now comes slowly' },
              ]}
            />
          </Field>
          <Field label="How long can you run without stopping right now?">
            <OptionList
              value={d.runContinuousMin}
              onChange={(runContinuousMin) => set({ runContinuousMin })}
              options={[
                { value: 0, label: 'Not yet / under 5 minutes', hint: "You'll start with run/walk intervals" },
                { value: 5, label: '5–15 minutes' },
                { value: 15, label: '15–30 minutes' },
                { value: 30, label: '30 minutes or more' },
              ]}
            />
          </Field>
          {(d.runContinuousMin ?? 0) >= 15 && (
            <>
              <Field label={`Current weekly running (optional)`}>
                <NumberInput
                  value={d.weeklyRunKm === undefined ? undefined : mi ? d.weeklyRunKm / KM_PER_MI : d.weeklyRunKm}
                  onChange={(v) => set({ weeklyRunKm: v === undefined ? undefined : mi ? v * KM_PER_MI : v })}
                  suffix={mi ? 'mi' : 'km'}
                  decimals={1}
                  step={0.5}
                />
              </Field>
              <Field label="Recent 5k time (optional)">
                <DurationInput seconds={d.recent5kSec} onChange={(recent5kSec) => set({ recent5kSec })} placeholder="e.g. 28:30" />
              </Field>
              <Field label="Recent 10k time (optional)">
                <DurationInput seconds={d.recent10kSec} onChange={(recent10kSec) => set({ recent10kSec })} placeholder="e.g. 59:00" />
              </Field>
            </>
          )}
        </>
      );
    },
    validate: (d) => {
      if (!d.liftExperience) return 'Please choose your lifting experience.';
      if (d.runContinuousMin === undefined) return 'Please choose how long you can run.';
    },
  },
  {
    title: 'Your schedule',
    render: ({ d, set }) => (
      <>
        <Field label="Which days can you train?" hint="Pick every day you could realistically fit a session in.">
          <DayPicker days={d.trainingDays ?? []} onChange={(trainingDays) => set({ trainingDays })} />
        </Field>
        <Field label="Two sessions on one day?" hint="For example, an easy run in the morning and weights in the evening, or a short run straight after lifting.">
          <Segmented
            value={d.allowDoubles ? 'yes' : 'no'}
            options={[
              { value: 'yes', label: 'Yes, sometimes' },
              { value: 'no', label: 'No' },
            ]}
            onChange={(v) => set({ allowDoubles: v === 'yes' })}
          />
        </Field>
        <Field label="Time available per session">
          <Segmented
            value={d.sessionMinutes}
            options={[30, 45, 60, 75, 90].map((m) => ({ value: m, label: `${m} min` }))}
            onChange={(sessionMinutes) => set({ sessionMinutes })}
          />
        </Field>
        {(d.trainingDays?.length ?? 0) > 0 && (
          <Field label="Preferred long-run day" hint="Usually the day you have the most time.">
            <DayPicker days={d.longRunDay !== undefined ? [d.longRunDay] : []} onChange={(v) => set({ longRunDay: v[0] })} single />
          </Field>
        )}
      </>
    ),
    validate: (d) => {
      const n = d.trainingDays?.length ?? 0;
      if (n < 2) return 'Pick at least 2 days (3–5 works best for combining lifting and running).';
      if (d.longRunDay !== undefined && !d.trainingDays!.includes(d.longRunDay)) return 'The long-run day needs to be one of your training days.';
    },
  },
  {
    title: 'Equipment',
    render: ({ d, set }) => (
      <>
        <Field label="Where will you lift?">
          <OptionList
            value={d.equipment}
            onChange={(equipment) => set({ equipment })}
            options={[
              { value: 'gym', label: 'Commercial gym', hint: 'Machines, cables, barbells, dumbbells' },
              { value: 'home', label: 'Home gym' },
              { value: 'bodyweight', label: 'Bodyweight only' },
            ]}
          />
        </Field>
        {d.equipment === 'home' && (
          <Field label="What do you have?">
            <Chips<HomeEquip>
              values={d.homeEquipment ?? []}
              onChange={(homeEquipment) => set({ homeEquipment })}
              options={[
                { value: 'dumbbells', label: 'Dumbbells' },
                { value: 'adjustable_bench', label: 'Adjustable bench' },
                { value: 'barbell', label: 'Barbell & plates' },
                { value: 'rack', label: 'Squat rack' },
                { value: 'pullup_bar', label: 'Pull-up bar' },
                { value: 'cables', label: 'Cable machine' },
                { value: 'bands', label: 'Resistance bands' },
                { value: 'kettlebells', label: 'Kettlebells' },
                { value: 'leg_machine', label: 'Leg curl/extension' },
              ]}
            />
          </Field>
        )}
      </>
    ),
    validate: (d) => (d.equipment === 'home' && !d.homeEquipment?.length ? 'Pick at least one piece of equipment (or choose bodyweight only).' : undefined),
  },
  {
    title: 'Injuries & limitations',
    intro: 'Exercises that load these areas will be swapped for friendlier alternatives.',
    render: ({ d, set }) => (
      <>
        <Field label="Any areas to protect?">
          <Chips<InjuryArea>
            values={d.injuries ?? []}
            onChange={(injuries) => set({ injuries })}
            options={[
              { value: 'lower_back', label: 'Lower back' },
              { value: 'knee', label: 'Knee' },
              { value: 'shoulder', label: 'Shoulder' },
              { value: 'elbow', label: 'Elbow' },
              { value: 'wrist', label: 'Wrist' },
              { value: 'hip', label: 'Hip' },
              { value: 'ankle', label: 'Ankle' },
              { value: 'neck', label: 'Neck' },
            ]}
          />
        </Field>
        <Field label="Anything else? (optional)" hint="e.g. 'no barbell back squats', 'sore Achilles after long runs'">
          <textarea value={d.injuryNotes ?? ''} onChange={(e) => set({ injuryNotes: e.target.value })} />
        </Field>
        <p className="small muted">This app isn't medical advice. For pain that's getting worse, see a physio or doctor.</p>
      </>
    ),
  },
  {
    title: 'Nutrition',
    render: ({ d, set }) => (
      <>
        <Field label="Meals per day">
          <Segmented value={d.mealsPerDay} options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} onChange={(mealsPerDay) => set({ mealsPerDay })} />
        </Field>
        <Field label="What targets do you want?">
          <OptionList
            value={d.nutritionMode}
            onChange={(nutritionMode) => set({ nutritionMode })}
            options={[
              { value: 'calories_protein', label: 'Calories + protein', hint: 'Simplest – the two numbers that matter most' },
              { value: 'macros', label: 'Full macros', hint: 'Calories, protein, carbs and fat' },
            ]}
          />
        </Field>
      </>
    ),
  },
];

export function isCompleteProfile(d: Draft): d is Profile {
  return STEPS.every((s) => !s.validate?.(d));
}

export default function Onboarding() {
  const settings = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState(Number(params.get('step') ?? 0));
  const [error, setError] = useState<string>();

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      const active = await getActivePhase();
      // Editing an existing plan starts from its answers; otherwise resume any saved draft.
      const fromPhase = params.get('edit') && active ? active.profile : undefined;
      setDraft({ ...DEFAULT_DRAFT, ...(s.draftProfile ?? fromPhase ?? {}) });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!draft) return null;
  const current = STEPS[step];
  const set = (patch: Draft) => {
    setError(undefined);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const next = async () => {
    const err = current.validate?.(draft);
    if (err) return setError(err);
    await updateSettings({ draftProfile: draft });
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo(0, 0);
    } else {
      navigate(`/setup/review${params.get('edit') ? '?edit=1' : ''}`);
    }
  };
  const back = () => {
    if (step === 0) return navigate(-1);
    setStep(step - 1);
    window.scrollTo(0, 0);
  };

  return (
    <div className="page no-nav">
      <div className="progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <p className="small muted">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1>{current.title}</h1>
      {current.intro && <p className="muted">{current.intro}</p>}
      <div style={{ marginTop: 16 }}>{current.render({ d: draft, set, settings })}</div>
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
      <div className="step-footer">
        {(step > 0 || params.get('edit')) && (
          <button className="btn" onClick={back}>
            Back
          </button>
        )}
        <button className="btn primary" onClick={next}>
          {step === STEPS.length - 1 ? 'Build my plan' : 'Next'}
        </button>
      </div>
    </div>
  );
}
