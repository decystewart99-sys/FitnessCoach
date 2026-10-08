import { Link } from 'react-router-dom';

const ITEMS = [
  { to: '/checkin', title: 'Weekly check-in & trends', sub: 'Coach review, calorie adjustments, calories vs target, maintenance estimate' },
  { to: '/photos', title: 'Progress photos', sub: 'Weekly front, side and back photos with side-by-side comparison' },
  { to: '/health', title: 'Health', sub: 'Steps, resting heart rate and sleep from Garmin' },
  { to: '/calendar', title: 'Add plan to Calendar', sub: 'Sessions and reminders with alerts in your iPhone Calendar' },
  { to: '/import/garmin', title: 'Import runs from Garmin', sub: 'Load a Garmin Connect activities CSV' },
  { to: '/plan', title: 'Plan', sub: 'Your phase: targets, schedule, running progression and the reasoning' },
  { to: '/settings', title: 'Settings', sub: 'Units, questionnaire, backups' },
  { to: '/settings/health', title: 'Import from Apple Health', sub: 'MyFitnessPal food totals and weight via an iPhone Shortcut' },
];

export default function MoreScreen() {
  return (
    <div className="page">
      <h1>More</h1>
      <div className="card">
        {ITEMS.map((i) => (
          <Link className="list-row" key={i.to} to={i.to}>
            <div>
              <div style={{ fontWeight: 600 }}>{i.title}</div>
              <div className="small muted">{i.sub}</div>
            </div>
            <span className="muted">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
