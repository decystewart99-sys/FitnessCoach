import { useNavigate } from 'react-router-dom';
import { useActivePhase, useSettings } from '../hooks';
import { updateSettings } from '../db';
import PhaseDetails from '../components/PhaseDetails';

export default function PlanScreen() {
  const phase = useActivePhase();
  const settings = useSettings();
  const navigate = useNavigate();
  if (!phase) return null;

  const edit = async (startAtAnswers: boolean) => {
    // Start editing from the current phase's answers, not an old draft.
    await updateSettings({ draftProfile: phase.profile });
    navigate(startAtAnswers ? '/setup?step=1&edit=1' : '/setup/review?edit=1');
  };

  return (
    <div className="page">
      <h1>Plan</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn small" onClick={() => edit(false)}>
          Edit plan
        </button>
        <button className="btn small" onClick={() => edit(true)}>
          Change my answers
        </button>
      </div>
      <PhaseDetails phase={phase} settings={settings} />
    </div>
  );
}
