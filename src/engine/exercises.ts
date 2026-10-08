// Exercise library. Ordered by preference within each movement pattern: stable, efficient
// exercises that load the muscle well in its lengthened (stretched) position come first.

import type { EquipmentSetup, HomeEquip, InjuryArea, Muscle } from '../types';

export type Equip = 'barbell' | 'rack' | 'dumbbells' | 'bench' | 'cable' | 'machine' | 'pullup_bar' | 'bands' | 'kettlebell' | 'leg_machine' | 'none';

export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'knee_ext'
  | 'knee_flex'
  | 'calf'
  | 'h_push'
  | 'v_push'
  | 'h_pull'
  | 'v_pull'
  | 'side_delt'
  | 'rear_delt'
  | 'chest_iso'
  | 'biceps'
  | 'triceps'
  | 'abs';

/** compound = big heavy lift (6–10 reps); secondary = compound, moderate (8–12); isolation = 10–15+. */
export type ExerciseKind = 'compound' | 'secondary' | 'isolation';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  kind: ExerciseKind;
  /** 1 = main target, 0.5 = meaningful secondary work (counts as half a set). */
  muscles: Partial<Record<Muscle, 1 | 0.5>>;
  /** Any one of these equipment combinations is enough. */
  equipment: Equip[][];
  /** Areas this exercise loads heavily – avoided when the user flags them. */
  stress: InjuryArea[];
  cues: string[];
  /** Weight is optional (bodyweight movement); progress with reps, then a harder variation. */
  bodyweight?: boolean;
  /** Logged weight is per dumbbell. */
  perHand?: boolean;
  /** Rep range override, e.g. calves and lateral raises respond well to higher reps. */
  reps?: [number, number];
}

const E = (e: Exercise) => e;

export const EXERCISES: Exercise[] = [
  // ---------- Squat pattern ----------
  E({ id: 'hack_squat', name: 'Hack squat', pattern: 'squat', kind: 'compound', muscles: { quads: 1, glutes: 0.5 }, equipment: [['machine']], stress: ['knee'], cues: ['Feet mid-platform, shoulder width', 'Sink as deep as you can with a neutral back', 'Drive through the whole foot; don\'t lock out hard'] }),
  E({ id: 'back_squat', name: 'Barbell back squat', pattern: 'squat', kind: 'compound', muscles: { quads: 1, glutes: 0.5 }, equipment: [['barbell', 'rack']], stress: ['knee', 'lower_back'], cues: ['Brace your core hard before each rep', 'Knees track over toes, sit between your hips', 'Hips and chest rise together'] }),
  E({ id: 'leg_press', name: 'Leg press', pattern: 'squat', kind: 'compound', muscles: { quads: 1, glutes: 0.5 }, equipment: [['machine']], stress: [], cues: ['Lower until your hips are about to tuck', 'Keep your lower back on the pad', 'Push through mid-foot; control the descent'] }),
  E({ id: 'goblet_squat', name: 'Goblet squat', pattern: 'squat', kind: 'compound', muscles: { quads: 1, glutes: 0.5 }, equipment: [['dumbbells'], ['kettlebell']], stress: ['knee'], cues: ['Hold the weight at your chest', 'Elbows inside knees at the bottom', 'Heels on a small plate helps depth'] }),
  E({ id: 'bw_squat', name: 'Heels-elevated tempo squat', pattern: 'squat', kind: 'compound', bodyweight: true, muscles: { quads: 1, glutes: 0.5 }, equipment: [['none']], stress: ['knee'], reps: [12, 25], cues: ['Heels on a book or step', '3 seconds down, pause at the bottom', 'Go deep – that\'s where the quads work hardest'] }),

  // ---------- Hinge ----------
  E({ id: 'rdl', name: 'Romanian deadlift', pattern: 'hinge', kind: 'compound', muscles: { hamstrings: 1, glutes: 1, back: 0.5 }, equipment: [['barbell']], stress: ['lower_back'], cues: ['Soft knees, push hips straight back', 'Bar stays against your legs', 'Stop when hamstrings are fully stretched – usually mid-shin'] }),
  E({ id: 'db_rdl', name: 'Dumbbell Romanian deadlift', pattern: 'hinge', kind: 'compound', perHand: true, muscles: { hamstrings: 1, glutes: 1 }, equipment: [['dumbbells']], stress: ['lower_back'], cues: ['Hips back, dumbbells close to your legs', 'Neutral back throughout', 'Feel the stretch, then squeeze glutes to stand'] }),
  E({ id: 'hip_thrust', name: 'Barbell hip thrust', pattern: 'hinge', kind: 'secondary', muscles: { glutes: 1, hamstrings: 0.5 }, equipment: [['barbell', 'bench'], ['machine']], stress: [], cues: ['Upper back on the bench edge, chin tucked', 'Shins vertical at the top', 'Squeeze glutes hard and pause'] }),
  E({ id: 'back_ext', name: '45° back extension', pattern: 'hinge', kind: 'secondary', muscles: { glutes: 1, hamstrings: 1 }, equipment: [['machine']], stress: ['lower_back'], cues: ['Pad just below your hips', 'Round slightly to bias glutes, or stay flat for hamstrings', 'Hold a plate when bodyweight gets easy'] }),
  E({ id: 'sl_rdl', name: 'Single-leg Romanian deadlift', pattern: 'hinge', kind: 'secondary', muscles: { hamstrings: 1, glutes: 1 }, equipment: [['dumbbells'], ['kettlebell'], ['none']], stress: [], cues: ['Hold something for balance if needed', 'Hips stay square to the floor', 'Reach the free leg back as you hinge'] }),
  E({ id: 'glute_bridge', name: 'Single-leg glute bridge', pattern: 'hinge', kind: 'secondary', bodyweight: true, muscles: { glutes: 1, hamstrings: 0.5 }, equipment: [['none']], stress: [], reps: [12, 25], cues: ['Drive through the heel', 'Pause and squeeze at the top', 'Shoulders on a sofa edge makes it harder'] }),

  // ---------- Lunge / single-leg ----------
  E({ id: 'bss', name: 'Bulgarian split squat', pattern: 'lunge', kind: 'secondary', perHand: true, muscles: { quads: 1, glutes: 1 }, equipment: [['dumbbells', 'bench'], ['bench'], ['none']], stress: ['knee'], cues: ['Rear foot on a bench, front foot far enough forward', 'Drop straight down; lean forward slightly for more glutes', 'Do all reps on one leg, then switch'] }),
  E({ id: 'reverse_lunge', name: 'Reverse lunge', pattern: 'lunge', kind: 'secondary', perHand: true, muscles: { quads: 1, glutes: 1 }, equipment: [['dumbbells'], ['kettlebell'], ['none']], stress: [], cues: ['Step back, not forward – easier on the knees', 'Back knee gently touches down', 'Push through the front heel'] }),
  E({ id: 'step_up', name: 'Step-up', pattern: 'lunge', kind: 'secondary', perHand: true, muscles: { quads: 1, glutes: 1 }, equipment: [['dumbbells', 'bench'], ['bench']], stress: ['knee'], cues: ['Box at knee height', 'Drive with the top leg only – no bounce off the back foot', 'Control the way down'] }),

  // ---------- Knee extension (quads iso) ----------
  E({ id: 'leg_ext', name: 'Leg extension', pattern: 'knee_ext', kind: 'isolation', muscles: { quads: 1 }, equipment: [['machine'], ['leg_machine']], stress: ['knee'], cues: ['Lean back slightly to stretch the quads', 'Squeeze at the top for a second', 'Lower slowly'] }),
  E({ id: 'reverse_nordic', name: 'Reverse Nordic', pattern: 'knee_ext', kind: 'isolation', bodyweight: true, muscles: { quads: 1 }, equipment: [['none'], ['bands']], stress: ['knee'], reps: [8, 15], cues: ['Kneel on a soft surface, hips straight', 'Lean back as far as you can control', 'Use a band anchored in front for help'] }),

  // ---------- Knee flexion (hamstring curl) ----------
  E({ id: 'seated_curl', name: 'Seated leg curl', pattern: 'knee_flex', kind: 'isolation', muscles: { hamstrings: 1 }, equipment: [['machine'], ['leg_machine']], stress: [], cues: ['Lean forward – it stretches the hamstrings more (good for growth)', 'Full range, squeeze at the bottom', '2–3 second lowering'] }),
  E({ id: 'lying_curl', name: 'Lying leg curl', pattern: 'knee_flex', kind: 'isolation', muscles: { hamstrings: 1 }, equipment: [['machine'], ['leg_machine']], stress: [], cues: ['Hips pressed into the pad', 'Curl all the way, lower slowly'] }),
  E({ id: 'slider_curl', name: 'Slider / towel leg curl', pattern: 'knee_flex', kind: 'isolation', bodyweight: true, muscles: { hamstrings: 1 }, equipment: [['none']], stress: [], reps: [8, 15], cues: ['Feet on a towel on a smooth floor', 'Hips up, slide heels in and out', 'Make it harder with one leg'] }),
  E({ id: 'band_curl_leg', name: 'Banded leg curl', pattern: 'knee_flex', kind: 'isolation', muscles: { hamstrings: 1 }, equipment: [['bands']], stress: [], reps: [12, 20], cues: ['Anchor the band low, lie face down', 'Full range, slow return'] }),

  // ---------- Calves ----------
  E({ id: 'standing_calf', name: 'Standing calf raise', pattern: 'calf', kind: 'isolation', muscles: { calves: 1 }, equipment: [['machine']], stress: [], reps: [10, 20], cues: ['Pause 2 seconds in the deep stretch at the bottom', 'Straight knees', 'No bouncing'] }),
  E({ id: 'lp_calf', name: 'Leg-press calf raise', pattern: 'calf', kind: 'isolation', muscles: { calves: 1 }, equipment: [['machine']], stress: [], reps: [10, 20], cues: ['Balls of feet on the edge of the platform', 'Deep stretch, pause, then press'] }),
  E({ id: 'step_calf', name: 'Single-leg calf raise on a step', pattern: 'calf', kind: 'isolation', perHand: true, muscles: { calves: 1 }, equipment: [['dumbbells'], ['none']], stress: [], reps: [10, 20], cues: ['Heel drops below the step', 'Pause at the bottom', 'Hold a dumbbell when 20 reps gets easy'] }),

  // ---------- Horizontal push ----------
  E({ id: 'bench', name: 'Barbell bench press', pattern: 'h_push', kind: 'compound', muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equipment: [['barbell', 'bench', 'rack']], stress: ['shoulder'], cues: ['Shoulder blades back and down, slight arch', 'Bar touches lower chest, elbows ~45°', 'Feet planted, press up and slightly back'] }),
  E({ id: 'db_bench', name: 'Dumbbell bench press', pattern: 'h_push', kind: 'compound', perHand: true, muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equipment: [['dumbbells', 'bench']], stress: ['shoulder'], cues: ['Lower until you feel a good chest stretch', 'Elbows slightly tucked', 'Press up and together'] }),
  E({ id: 'incline_db', name: 'Incline dumbbell press', pattern: 'h_push', kind: 'compound', perHand: true, muscles: { chest: 1, shoulders: 0.5, triceps: 0.5 }, equipment: [['dumbbells', 'bench']], stress: ['shoulder'], cues: ['Bench at ~30°', 'Deep stretch at the bottom', 'Keep shoulder blades pinned'] }),
  E({ id: 'machine_press', name: 'Machine chest press', pattern: 'h_push', kind: 'compound', muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equipment: [['machine']], stress: [], cues: ['Handles at mid-chest height', 'Let the chest stretch, don\'t bounce', 'Very stable – great to push close to failure safely'] }),
  E({ id: 'pushup', name: 'Push-up (deficit when possible)', pattern: 'h_push', kind: 'compound', bodyweight: true, muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equipment: [['none']], stress: ['wrist'], reps: [8, 25], cues: ['Hands on books/handles for a deeper stretch', 'Body in a straight line', 'Elevate feet or add a backpack to progress'] }),
  E({ id: 'band_press', name: 'Banded chest press', pattern: 'h_push', kind: 'secondary', muscles: { chest: 1, triceps: 0.5 }, equipment: [['bands'], ['cable']], stress: [], reps: [10, 20], cues: ['Anchor behind you at chest height', 'Press forward and slightly together'] }),

  // ---------- Vertical push ----------
  E({ id: 'seated_db_ohp', name: 'Seated dumbbell shoulder press', pattern: 'v_push', kind: 'compound', perHand: true, muscles: { shoulders: 1, triceps: 0.5 }, equipment: [['dumbbells', 'bench']], stress: ['shoulder'], cues: ['Bench almost upright', 'Lower to ear height', 'Press up, not forward'] }),
  E({ id: 'machine_ohp', name: 'Machine shoulder press', pattern: 'v_push', kind: 'compound', muscles: { shoulders: 1, triceps: 0.5 }, equipment: [['machine']], stress: ['shoulder'], cues: ['Seat so handles start at shoulder height', 'Full range, controlled'] }),
  E({ id: 'landmine_press', name: 'Half-kneeling landmine press', pattern: 'v_push', kind: 'secondary', muscles: { shoulders: 1, chest: 0.5, triceps: 0.5 }, equipment: [['barbell']], stress: [], cues: ['Bar end wedged in a corner', 'Press up and forward – shoulder-friendly angle', 'Brace your abs, squeeze glute of the down knee'] }),
  E({ id: 'ohp', name: 'Standing overhead press', pattern: 'v_push', kind: 'compound', muscles: { shoulders: 1, triceps: 0.5 }, equipment: [['barbell', 'rack']], stress: ['shoulder', 'lower_back'], cues: ['Squeeze glutes, ribs down', 'Head moves back then through', 'Lock out overhead'] }),
  E({ id: 'pike_pushup', name: 'Pike push-up', pattern: 'v_push', kind: 'compound', bodyweight: true, muscles: { shoulders: 1, triceps: 0.5 }, equipment: [['none']], stress: ['shoulder', 'wrist'], reps: [6, 15], cues: ['Hips high, head toward the floor in front of your hands', 'Feet on a chair to progress'] }),

  // ---------- Horizontal pull ----------
  E({ id: 'cs_row', name: 'Chest-supported row', pattern: 'h_pull', kind: 'secondary', muscles: { back: 1, biceps: 0.5, shoulders: 0.5 }, equipment: [['machine'], ['dumbbells', 'bench']], stress: [], cues: ['Chest on the pad/incline bench – takes the lower back out of it', 'Let shoulder blades stretch forward', 'Pull elbows back, squeeze'] }),
  E({ id: 'cable_row', name: 'Seated cable row', pattern: 'h_pull', kind: 'secondary', muscles: { back: 1, biceps: 0.5 }, equipment: [['cable']], stress: [], cues: ['Reach forward for a full stretch', 'Torso stays still – no rocking', 'Pull to your belly button'] }),
  E({ id: 'db_row', name: 'One-arm dumbbell row', pattern: 'h_pull', kind: 'secondary', muscles: { back: 1, biceps: 0.5 }, equipment: [['dumbbells', 'bench'], ['dumbbells']], stress: [], cues: ['Support with the other hand on a bench', 'Pull toward your hip', 'Full stretch at the bottom'] }),
  E({ id: 'bb_row', name: 'Barbell row', pattern: 'h_pull', kind: 'compound', muscles: { back: 1, biceps: 0.5, hamstrings: 0.5 }, equipment: [['barbell']], stress: ['lower_back'], cues: ['Hinge to ~45°, brace', 'Pull to lower ribs', 'No heaving'] }),
  E({ id: 'inverted_row', name: 'Inverted row', pattern: 'h_pull', kind: 'secondary', bodyweight: true, muscles: { back: 1, biceps: 0.5 }, equipment: [['pullup_bar'], ['barbell', 'rack'], ['none']], stress: [], reps: [6, 20], cues: ['Under a low bar or a sturdy table', 'Body straight, pull chest to the bar', 'Walk feet forward to make it harder'] }),
  E({ id: 'band_row', name: 'Banded row', pattern: 'h_pull', kind: 'secondary', muscles: { back: 1, biceps: 0.5 }, equipment: [['bands']], stress: [], reps: [12, 20], cues: ['Anchor at chest height', 'Squeeze shoulder blades together'] }),

  // ---------- Vertical pull ----------
  E({ id: 'pulldown', name: 'Lat pulldown', pattern: 'v_pull', kind: 'secondary', muscles: { back: 1, biceps: 0.5 }, equipment: [['cable'], ['machine']], stress: [], cues: ['Let the lats stretch fully at the top', 'Drive elbows down to your sides', 'Slight lean back, chest up'] }),
  E({ id: 'pullup', name: 'Pull-up / chin-up', pattern: 'v_pull', kind: 'compound', bodyweight: true, muscles: { back: 1, biceps: 0.5 }, equipment: [['pullup_bar']], stress: ['elbow'], reps: [5, 12], cues: ['Dead hang at the bottom', 'Chest toward the bar', 'Use a band for assistance or add weight when 12 is easy'] }),
  E({ id: 'assisted_pullup', name: 'Assisted pull-up machine', pattern: 'v_pull', kind: 'secondary', muscles: { back: 1, biceps: 0.5 }, equipment: [['machine']], stress: ['elbow'], cues: ['Weight shown is assistance – less is harder', 'Full stretch at the bottom'] }),
  E({ id: 'band_pulldown', name: 'Banded pulldown', pattern: 'v_pull', kind: 'secondary', muscles: { back: 1, biceps: 0.5 }, equipment: [['bands']], stress: [], reps: [12, 20], cues: ['Anchor high (door anchor)', 'Pull elbows down to your sides'] }),

  // ---------- Side delts ----------
  E({ id: 'cable_lateral', name: 'Cable lateral raise', pattern: 'side_delt', kind: 'isolation', muscles: { shoulders: 1 }, equipment: [['cable']], stress: ['shoulder'], reps: [10, 20], cues: ['Cable behind you, start from across the body', 'Lead with the elbow', 'Constant tension through the whole range'] }),
  E({ id: 'db_lateral', name: 'Dumbbell lateral raise', pattern: 'side_delt', kind: 'isolation', perHand: true, muscles: { shoulders: 1 }, equipment: [['dumbbells']], stress: ['shoulder'], reps: [10, 20], cues: ['Slight forward lean', 'Raise out to the side to shoulder height', 'Light weight, strict form'] }),
  E({ id: 'machine_lateral', name: 'Machine lateral raise', pattern: 'side_delt', kind: 'isolation', muscles: { shoulders: 1 }, equipment: [['machine']], stress: ['shoulder'], reps: [10, 20], cues: ['Pads on the outside of your elbows', 'Control the lowering'] }),
  E({ id: 'band_lateral', name: 'Banded lateral raise', pattern: 'side_delt', kind: 'isolation', muscles: { shoulders: 1 }, equipment: [['bands']], stress: ['shoulder'], reps: [15, 25], cues: ['Stand on the band', 'Raise to shoulder height'] }),

  // ---------- Rear delts ----------
  E({ id: 'reverse_pec_deck', name: 'Reverse pec deck', pattern: 'rear_delt', kind: 'isolation', muscles: { shoulders: 1, back: 0.5 }, equipment: [['machine']], stress: [], reps: [12, 20], cues: ['Arms slightly bent, sweep out wide', 'Think "push the handles apart", not "squeeze the shoulder blades"'] }),
  E({ id: 'cable_rear_fly', name: 'Cable rear-delt fly', pattern: 'rear_delt', kind: 'isolation', muscles: { shoulders: 1, back: 0.5 }, equipment: [['cable']], stress: [], reps: [12, 20], cues: ['Cross the cables at shoulder height', 'Sweep out and back'] }),
  E({ id: 'db_rear_fly', name: 'Dumbbell rear-delt fly', pattern: 'rear_delt', kind: 'isolation', perHand: true, muscles: { shoulders: 1, back: 0.5 }, equipment: [['dumbbells']], stress: [], reps: [12, 20], cues: ['Chest on an incline bench or hinge over', 'Light weight, lead with the elbows'] }),
  E({ id: 'band_pull_apart', name: 'Band pull-apart', pattern: 'rear_delt', kind: 'isolation', muscles: { shoulders: 1, back: 0.5 }, equipment: [['bands']], stress: [], reps: [15, 30], cues: ['Arms straight at shoulder height', 'Pull the band to your chest'] }),

  // ---------- Chest isolation ----------
  E({ id: 'cable_fly', name: 'Cable fly', pattern: 'chest_iso', kind: 'isolation', muscles: { chest: 1 }, equipment: [['cable']], stress: [], reps: [10, 15], cues: ['Step forward so arms stretch back at the start', 'Hug a barrel', 'Squeeze hands together'] }),
  E({ id: 'pec_deck', name: 'Pec deck', pattern: 'chest_iso', kind: 'isolation', muscles: { chest: 1 }, equipment: [['machine']], stress: [], reps: [10, 15], cues: ['Handles behind your chest line at the start', 'Squeeze in front, control back'] }),
  E({ id: 'db_fly', name: 'Dumbbell fly', pattern: 'chest_iso', kind: 'isolation', perHand: true, muscles: { chest: 1 }, equipment: [['dumbbells', 'bench']], stress: ['shoulder'], reps: [10, 15], cues: ['Slight bend in the elbows', 'Lower until a good stretch – not further'] }),

  // ---------- Biceps ----------
  E({ id: 'incline_curl', name: 'Incline dumbbell curl', pattern: 'biceps', kind: 'isolation', perHand: true, muscles: { biceps: 1 }, equipment: [['dumbbells', 'bench']], stress: ['elbow'], reps: [8, 15], cues: ['Bench at ~45°, arms hang behind you (big stretch)', 'Elbows stay back', 'Slow lowering'] }),
  E({ id: 'cable_curl', name: 'Cable curl', pattern: 'biceps', kind: 'isolation', muscles: { biceps: 1 }, equipment: [['cable']], stress: [], reps: [10, 15], cues: ['Step back so the cable pulls your arms slightly behind you', 'Elbows pinned'] }),
  E({ id: 'db_curl', name: 'Dumbbell curl', pattern: 'biceps', kind: 'isolation', perHand: true, muscles: { biceps: 1 }, equipment: [['dumbbells']], stress: [], reps: [8, 15], cues: ['No swinging', 'Full lockout at the bottom'] }),
  E({ id: 'ez_curl', name: 'EZ-bar curl', pattern: 'biceps', kind: 'isolation', muscles: { biceps: 1 }, equipment: [['barbell']], stress: ['wrist', 'elbow'], reps: [8, 12], cues: ['Elbows by your sides', 'Control down'] }),
  E({ id: 'band_bicep', name: 'Banded curl', pattern: 'biceps', kind: 'isolation', muscles: { biceps: 1 }, equipment: [['bands']], stress: [], reps: [12, 25], cues: ['Stand on the band', 'Squeeze at the top'] }),

  // ---------- Triceps ----------
  E({ id: 'oh_cable_ext', name: 'Overhead cable triceps extension', pattern: 'triceps', kind: 'isolation', muscles: { triceps: 1 }, equipment: [['cable']], stress: ['elbow', 'shoulder'], reps: [10, 15], cues: ['Face away from the cable', 'Let your hands go deep behind your head (long-head stretch)', 'Elbows point forward'] }),
  E({ id: 'pushdown', name: 'Cable pushdown', pattern: 'triceps', kind: 'isolation', muscles: { triceps: 1 }, equipment: [['cable']], stress: [], reps: [10, 15], cues: ['Elbows pinned to your sides', 'Full lockout, slow return'] }),
  E({ id: 'db_oh_ext', name: 'Dumbbell overhead extension', pattern: 'triceps', kind: 'isolation', muscles: { triceps: 1 }, equipment: [['dumbbells']], stress: ['elbow', 'shoulder'], reps: [10, 15], cues: ['Hold one dumbbell with both hands', 'Lower behind your head for a deep stretch'] }),
  E({ id: 'skullcrusher', name: 'Skull crusher', pattern: 'triceps', kind: 'isolation', muscles: { triceps: 1 }, equipment: [['barbell', 'bench'], ['dumbbells', 'bench']], stress: ['elbow'], reps: [8, 12], cues: ['Lower behind your head, not to your forehead', 'Upper arms angled slightly back'] }),
  E({ id: 'close_pushup', name: 'Close-grip push-up', pattern: 'triceps', kind: 'isolation', bodyweight: true, muscles: { triceps: 1, chest: 0.5 }, equipment: [['none']], stress: ['wrist', 'elbow'], reps: [8, 25], cues: ['Hands under shoulders', 'Elbows brush your ribs'] }),
  E({ id: 'band_pushdown', name: 'Banded pushdown', pattern: 'triceps', kind: 'isolation', muscles: { triceps: 1 }, equipment: [['bands']], stress: [], reps: [15, 25], cues: ['Anchor high', 'Elbows still'] }),

  // ---------- Abs ----------
  E({ id: 'cable_crunch', name: 'Cable crunch', pattern: 'abs', kind: 'isolation', muscles: { abs: 1 }, equipment: [['cable']], stress: [], reps: [10, 20], cues: ['Kneel, rope by your head', 'Curl your ribs to your hips – hips stay still'] }),
  E({ id: 'hanging_raise', name: 'Hanging knee raise', pattern: 'abs', kind: 'isolation', bodyweight: true, muscles: { abs: 1 }, equipment: [['pullup_bar']], stress: [], reps: [8, 20], cues: ['Curl your pelvis up, not just lift the knees', 'No swinging'] }),
  E({ id: 'reverse_crunch', name: 'Reverse crunch', pattern: 'abs', kind: 'isolation', bodyweight: true, muscles: { abs: 1 }, equipment: [['none']], stress: [], reps: [10, 25], cues: ['Lie on a bench or floor', 'Roll your hips up toward your chest', 'Slow down'] }),
  E({ id: 'dead_bug', name: 'Dead bug', pattern: 'abs', kind: 'isolation', bodyweight: true, muscles: { abs: 1 }, equipment: [['none']], stress: [], reps: [8, 16], cues: ['Lower back pressed into the floor', 'Extend opposite arm and leg slowly', 'Breathe out fully'] }),
];

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

const HOME_MAP: Record<HomeEquip, Equip> = {
  dumbbells: 'dumbbells',
  adjustable_bench: 'bench',
  barbell: 'barbell',
  rack: 'rack',
  pullup_bar: 'pullup_bar',
  cables: 'cable',
  bands: 'bands',
  kettlebells: 'kettlebell',
  leg_machine: 'leg_machine',
};

export function availableEquipment(setup: EquipmentSetup, home: HomeEquip[]): Set<Equip> {
  if (setup === 'gym') return new Set<Equip>(['barbell', 'rack', 'dumbbells', 'bench', 'cable', 'machine', 'pullup_bar', 'bands', 'kettlebell', 'leg_machine', 'none']);
  if (setup === 'bodyweight') return new Set<Equip>(['none']);
  return new Set<Equip>(['none', ...home.map((h) => HOME_MAP[h])]);
}

export function canDo(e: Exercise, equip: Set<Equip>): boolean {
  return e.equipment.some((combo) => combo.every((q) => equip.has(q)));
}

/** Candidates for a pattern, best first. Injury-stressing exercises go last (used only if nothing else fits). */
export function candidatesFor(pattern: Pattern, equip: Set<Equip>, injuries: InjuryArea[]): Exercise[] {
  const all = EXERCISES.filter((e) => e.pattern === pattern && canDo(e, equip));
  const safe = all.filter((e) => !e.stress.some((s) => injuries.includes(s)));
  const risky = all.filter((e) => e.stress.some((s) => injuries.includes(s)));
  return [...safe, ...risky];
}

export function isRiskyFor(e: Exercise, injuries: InjuryArea[]): boolean {
  return e.stress.some((s) => injuries.includes(s));
}

export function repRange(e: Exercise): [number, number] {
  if (e.reps) return e.reps;
  return e.kind === 'compound' ? [6, 10] : e.kind === 'secondary' ? [8, 12] : [10, 15];
}

export function restSeconds(e: Exercise): number {
  return e.kind === 'compound' ? 180 : e.kind === 'secondary' ? 120 : 75;
}

/** Target reps in reserve: compounds stay further from failure; isolation can go closer. */
export function targetRir(e: Exercise): number {
  return e.kind === 'compound' ? 2 : e.kind === 'secondary' ? 2 : 1;
}

/** Smallest sensible jump in load, in kg (per dumbbell for dumbbell work). */
export function incrementKg(e: Exercise): number {
  if (e.perHand) return 2;
  return e.pattern === 'squat' || e.pattern === 'hinge' ? 5 : 2.5;
}
