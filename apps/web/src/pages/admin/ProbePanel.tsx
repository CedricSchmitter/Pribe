import { useState } from 'react';
import { API_PATHS, type ProbeStatusDto } from '@pribe/shared';
import { api, ApiRequestError } from '../../lib/api';
import { useToast } from '../../shell';
import { Panel } from './Panel';

/** R83: test run with bots in a separate database. */
export function ProbePanel({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await api<ProbeStatusDto>(active ? API_PATHS.admin.probeStop : API_PATHS.admin.probeStart, { body: {} });
      toast(res.active ? 'Probelauf gestartet – die Bots kommen 🤖' : 'Probelauf beendet, echte Daten sind zurück', 'success');
      onChange(res.active);
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.body.message : 'Probelauf ließ sich nicht umschalten.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Probelauf" index={0}>
      <p className="muted">
        {active
          ? 'Bots spielen in einer eigenen Test-Datenbank. Alles hier zeigt gerade die Testdaten. Echte Handys sehen „Probelauf läuft“.'
          : 'Testspiel mit 5 Bots und Beispiel-Präsentationen (HTML + PowerPoint), um Beamer, Gong und PowerPoint-Öffnen zu prüfen. Echte Personen, Einreichungen und Spielstand bleiben unberührt.'}
      </p>
      <div className="row-start">
        <button type="button" className={active ? 'danger' : undefined} disabled={busy} onClick={() => void toggle()}>
          {active ? 'Probelauf beenden' : 'Probelauf starten'}
        </button>
      </div>
    </Panel>
  );
}
