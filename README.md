# Fitness Coach

A personal fat-loss, running and strength coaching app. It's an installable web app (PWA): it runs offline, stores all data on the phone, and is published automatically to GitHub Pages.

## Install on iPhone

1. Open the app's web address in **Safari** (not Chrome – only Safari can install web apps on iPhone).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open it from the new home-screen icon from now on. Data saved in Safari's normal tab and in the home-screen app are kept separately.

## Getting updates

Every push to `main` rebuilds and republishes the app (takes ~1–2 minutes – watch the **Actions** tab on GitHub). Open the app; when "A new version is available" appears, tap **Update**. If nothing shows, close the app fully (swipe it away) and reopen it, or use **Settings → Check for updates**.

## Your data

Everything is stored locally on the device. Use **Settings → Save a backup** regularly (choose "Save to Files" → iCloud Drive). To move to a new phone: save a backup, open the app on the new phone, **Settings → Restore from a backup**.

## Build stages

- [x] (a) Onboarding, phase generation, calorie engine, backups
- [ ] (b) Workout builder, strength & run logging, rest timer
- [ ] (c) Weight tracker, food logging, weekly coach adjustments, rescheduling
- [ ] (d) Analytics and weekly check-in
- [ ] (e) Garmin CSV / Garmin data-export import, calendar export
- [ ] (f) Android app with Health Connect (when switching phones)

## Development

```bash
npm install
npm run dev     # local preview at http://localhost:5173
npm test        # engine unit tests
npm run build   # production build into dist/
```

Code layout: `src/engine/` holds the coaching logic (calories, scheduling, running, strength, adaptive coach) with tests in `engine.test.ts`; `src/screens/` holds the UI.
