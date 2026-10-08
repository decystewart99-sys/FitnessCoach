// Step-by-step guide for building the iPhone Shortcut that copies MyFitnessPal totals
// (via Apple Health) and today's weight to the clipboard for the app to import.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateSettings } from '../db';
import { useSettings } from '../hooks';
import { HealthImportButton } from '../components/HealthImport';
import { SHORTCUT_TEMPLATE } from '../lib/healthImport';

export default function HealthSetup() {
  const settings = useSettings();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(SHORTCUT_TEMPLATE);
      setCopied(true);
    } catch {
      /* user can type it */
    }
  };

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>Import from Apple Health</h1>
      <p className="muted">
        MyFitnessPal has no public connection for personal apps, but it can share your food totals with Apple Health. An iPhone Shortcut then copies them (and
        today's weight, if a scale or Garmin logs it) for this app to import with one tap.
      </p>
      <p className="small muted">Your data goes from Health to this app on your phone only – nothing is sent anywhere.</p>

      <h3 className="section-title">1 · Connect MyFitnessPal to Apple Health</h3>
      <div className="card">
        <ol className="steps">
          <li>
            In <b>MyFitnessPal</b>, open <b>More</b> (or your profile) → <b>Apps &amp; Devices</b> (sometimes under <b>Settings → Sharing &amp; Privacy</b>) → <b>Apple Health</b> →
            connect.
          </li>
          <li>
            When iPhone asks, allow MyFitnessPal to <b>write</b> Dietary Energy, Protein, Carbohydrates and Total Fat.
          </li>
          <li>
            Check it worked: open the <b>Health</b> app → <b>Browse</b> → <b>Nutrition</b> → <b>Dietary Energy</b>. After you log a meal in MyFitnessPal, it should show up here.
          </li>
        </ol>
        <p className="small muted">If you can't find the option, MyFitnessPal may have moved it – search "Apple Health" in their help pages.</p>
      </div>

      <h3 className="section-title">2 · Build the shortcut (once, ~5 minutes)</h3>
      <div className="card">
        <p className="small">
          Open the <b>Shortcuts</b> app → <b>+</b> (top right). Tap the name at the top and call it <b>Coach import</b>. Then add these actions in order (use the search box at the
          bottom to find each one):
        </p>
        <ol className="steps">
          <li>
            <b>Find Health Samples</b> → tap the type and pick <b>Dietary Energy</b> → <b>Add Filter</b> → set it to <b>Start Date</b> <b>is today</b>.
          </li>
          <li>
            <b>Calculate Statistics</b> → set it to <b>Sum</b> of <b>Health Samples</b>. Tap the result's name later when you need it – it'll be called "Statistics" (you can long-press
            it → <b>Rename</b> → <b>Calories</b>).
          </li>
          <li>
            Repeat steps 1–2 for <b>Protein</b> (rename to <b>Protein</b>), <b>Carbohydrates</b> (<b>Carbs</b>) and <b>Total Fat</b> (<b>Fat</b>). Carbs and fat are optional.
          </li>
          <li>
            <b>Find Health Samples</b> → <b>Weight</b>, filter <b>Start Date is today</b>, <b>Sort by</b> Start Date, <b>Order</b> Latest First, <b>Limit</b> on, <b>1</b>. Rename the
            result <b>Weight</b>. (Skip this if you weigh in by hand.)
          </li>
          <li>
            <b>Garmin health data (optional):</b>
            <ul>
              <li>
                <b>Find Health Samples</b> → <b>Steps</b>, Start Date is today → <b>Calculate Statistics</b> Sum → rename <b>Steps</b>.
              </li>
              <li>
                <b>Find Health Samples</b> → <b>Resting Heart Rate</b>, Start Date is today, Sort Latest First, Limit 1 → rename <b>Resting HR</b>.
              </li>
              <li>
                <b>Find Health Samples</b> → <b>Sleep</b> (Sleep Analysis), Start Date <b>is in the last 1 day</b> → add a filter <b>Value is not In Bed</b> (or "Asleep" types only) →{' '}
                <b>Get Details of Health Sample</b> → <b>Duration</b> → <b>Calculate Statistics</b> Sum → rename <b>Sleep</b>.
              </li>
            </ul>
            <span className="small muted">
              In <b>Garmin Connect</b> → More → Settings → <b>Connected Apps</b> → <b>Apple Health</b>, switch on sharing for steps, heart rate and sleep first.
            </span>
          </li>
          <li>
            <b>Format Date</b> → date <b>Current Date</b>, Date Format <b>Custom</b>, format string <b>yyyy-MM-dd</b>. Rename the result <b>Day</b>.
          </li>
          <li>
            <b>Text</b> → paste the template below, then replace each <code>[…]</code> by deleting it and tapping the matching variable (Day, Calories, Protein, Carbs, Fat, Weight, Steps, Resting HR, Sleep – leave any you skipped empty)
            in the bar above the keyboard.
            <div className="code-box">{SHORTCUT_TEMPLATE}</div>
            <button className="btn small" onClick={copyTemplate}>
              {copied ? 'Copied ✓' : 'Copy template'}
            </button>
          </li>
          <li>
            <b>Copy to Clipboard</b> (it'll use the Text automatically).
          </li>
          <li>
            <b>Show Notification</b> → "Copied – open Coach and tap Import".
          </li>
        </ol>
        <p className="small muted">
          Tap ▶ to test it. The first time, iPhone asks permission to read Health data – allow all the types.
        </p>
      </div>

      <h3 className="section-title">3 · Make it automatic (optional)</h3>
      <div className="card">
        <ol className="steps">
          <li>
            Shortcuts → <b>Automation</b> tab → <b>+</b> → <b>Time of Day</b> → e.g. <b>21:30</b>, <b>Daily</b>, <b>Run Immediately</b> → Next.
          </li>
          <li>
            Choose <b>Coach import</b>.
          </li>
        </ol>
        <p className="small muted">
          The totals then sit on the clipboard until you open the app and tap <b>Import from Health</b> (or until you copy something else). You can also run the shortcut any time, and
          re-importing later the same day simply updates the numbers.
        </p>
      </div>

      <h3 className="section-title">4 · Test it</h3>
      <div className="card">
        <p className="small">Run the shortcut, come back here, and tap the button. You'll see what was imported.</p>
        <HealthImportButton />
        <hr className="sep" />
        <label className="spread" style={{ cursor: 'pointer' }}>
          <span>
            <b>Show the import button on Today</b>
            <span className="field-hint">Turn on once the shortcut works.</span>
          </span>
          <input type="checkbox" checked={!!settings.healthImport} onChange={(e) => updateSettings({ healthImport: e.target.checked })} style={{ width: 24, height: 24 }} />
        </label>
      </div>
    </div>
  );
}
