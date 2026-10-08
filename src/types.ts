// Shared data types. Everything is stored locally on the device (IndexedDB via Dexie).

export type Sex = 'male' | 'female';
export type WeightUnit = 'kg' | 'stlb' | 'lb';
export type DistanceUnit = 'km' | 'mi';
export type HeightUnit = 'cm' | 'ftin';
export type Goal = 'fat' | 'run' | 'muscle';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type JobActivity = 'sedentary' | 'light' | 'active' | 'very_active';
export type RunGoalKind = 'none' | '5k' | '10k' | 'half' | 'marathon';
/** Longest the user can currently run without stopping, in minutes (bucketed). */
export type RunContinuous = 0 | 5 | 15 | 30;
export type EquipmentSetup = 'gym' | 'home' | 'bodyweight';
export type HomeEquip =
  | 'dumbbells'
  | 'adjustable_bench'
  | 'barbell'
  | 'rack'
  | 'pullup_bar'
  | 'cables'
  | 'bands'
  | 'kettlebells'
  | 'leg_machine';
export type InjuryArea = 'lower_back' | 'knee' | 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'ankle' | 'neck';
export type NutritionMode = 'macros' | 'calories_protein';

export interface Profile {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number;
  waistCm?: number;

  jobActivity: JobActivity;
  avgSteps?: number;

  /** index 0 = top priority */
  goalRanking: Goal[];
  targetWeightKg?: number;
  /** Planned loss rate as % of body weight per week (0.25 – 1.0). */
  weeklyLossPct: number;
  runGoal: { kind: RunGoalKind; targetTimeSec?: number; raceDate?: string };

  liftExperience: Experience;
  runContinuousMin: RunContinuous;
  weeklyRunKm?: number;
  recent5kSec?: number;
  recent10kSec?: number;

  /** 0 = Monday … 6 = Sunday */
  trainingDays: number[];
  allowDoubles: boolean;
  sessionMinutes: number;
  longRunDay?: number;

  equipment: EquipmentSetup;
  homeEquipment: HomeEquip[];

  injuries: InjuryArea[];
  injuryNotes: string;

  mealsPerDay: number;
  nutritionMode: NutritionMode;
}

export type StrengthDayKind = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs';
export type RunSlot = 'easy' | 'quality' | 'long';

export interface PlannedSession {
  id: string;
  type: 'strength' | 'run';
  label: string;
  strengthKind?: StrengthDayKind;
  runSlot?: RunSlot;
}

export interface DayPlan {
  day: number; // 0 = Mon
  sessions: PlannedSession[];
}

export type RunKind =
  | 'runwalk'
  | 'easy'
  | 'easy_strides'
  | 'long'
  | 'fartlek'
  | 'tempo'
  | 'intervals'
  | 'timetrial'
  | 'race';

export interface RunPrescription {
  slot: RunSlot;
  kind: RunKind;
  minutes: number;
  title: string;
  description: string;
  runWalk?: { runSec: number; walkSec: number; reps: number };
  /** Target pace range in seconds per km, when a recent race/time-trial time is known. */
  pace?: { lo: number; hi: number; label: string };
}

export interface PhaseWeek {
  index: number; // 1-based
  tags: Array<'cutback' | 'deload' | 'diet_break' | 'taper' | 'race' | 'time_trial'>;
  runMinutes: number;
  /** One entry per run session in the weekly template, keyed by session id. */
  runs: Record<string, RunPrescription>;
  kcalTarget: number;
}

export type Muscle =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs';

export interface StrengthPlan {
  splitName: string;
  sessions: Array<{ id: string; kind: StrengthDayKind; label: string; focus: string }>;
  weeklySets: Record<Muscle, number>;
  repGuide: string;
  rirGuide: string;
}

export interface EnergyPlan {
  bmr: number;
  bmrMethod: string;
  lifestyleMultiplier: number;
  exerciseKcalPerDay: number;
  maintenanceKcal: number;
  plannedLossKgPerWeek: number;
  deficitKcal: number;
  targetKcal: number;
  floorKcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  notes: string[];
}

export interface Rationale {
  title: string;
  body: string;
}

export interface PhaseOptions {
  startDate: string;
  lengthWeeks?: number;
  weeklyLossPct?: number;
  kcalOverride?: number;
  proteinOverride?: number;
  template?: DayPlan[];
}

export interface Phase {
  id?: number;
  createdAt: string;
  status: 'active' | 'archived';
  startDate: string;
  lengthWeeks: number;
  profile: Profile;
  options: PhaseOptions;
  energy: EnergyPlan;
  template: DayPlan[];
  scheduleWarnings: string[];
  strength: StrengthPlan;
  weeks: PhaseWeek[];
  rationale: Rationale[];
  warnings: string[];
  /** Rescheduled sessions: key `${weekIndex}:${sessionId}` → new date, or 'skip'. */
  moves?: Record<string, string>;
}

export interface CheckIn {
  /** Monday of the week the check-in was done (it reviews the previous week). */
  week: string;
  phaseId: number;
  createdAt: string;
  /** Maintenance estimate before this check-in. */
  previousTdee: number;
  tdee: number;
  previousTarget: number;
  newTarget: number;
  stalled: boolean;
  confidence: 'low' | 'medium' | 'high';
  ok: boolean;
  avgIntake?: number;
  trendKg?: number;
  observedLossKgPerWeek?: number;
  reasons: string[];
  actions: Array<'diet_break' | 'deload'>;
}

export interface Settings {
  id: 'settings';
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  heightUnit: HeightUnit;
  draftProfile?: Partial<Profile>;
  lastBackupAt?: string;
  /** Weekday (0 = Mon) for the weekly progress-photo reminder. */
  photoDay?: number;
  /** Include progress photos in backup files (makes them much larger). */
  backupPhotos?: boolean;
  /** Show the "Import from Health" button (set once the user has built the iPhone Shortcut). */
  healthImport?: boolean;
  lastHealthImportAt?: string;
}

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  kg: number;
}

export type RunLogKind = 'easy' | 'long' | 'runwalk' | 'fartlek' | 'tempo' | 'intervals' | 'timetrial' | 'race' | 'other';

export interface RunLog {
  id?: number;
  date: string;
  /** Planned session this run fulfils, if any. */
  sessionId?: string;
  kind: RunLogKind;
  distanceKm?: number;
  durationSec: number;
  avgHr?: number;
  maxHr?: number;
  /** Effort 1–10. */
  rpe?: number;
  notes?: string;
  source: 'manual' | 'garmin' | 'health';
}

export type PhotoPose = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id?: number;
  date: string;
  /** Monday of the photo's week – photos are grouped and compared by week. */
  week: string;
  pose: PhotoPose;
  blob: Blob;
  width: number;
  height: number;
}

export interface NutritionEntry {
  date: string;
  kcal: number;
  proteinG: number;
  carbG?: number;
  fatG?: number;
}
