export interface DeviceTableLine {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
}

export interface DeviceTableProps {
  lines: DeviceTableLine[];
}

const LABELS: Record<string, string> = {
  userAgent: 'Navigateur',
  platform: 'Plateforme',
  language: 'Langue',
  screen: 'Écran',
  timezone: 'Fuseau horaire',
  canvasHash: 'Empreinte canvas',
};

export function DeviceTable({ lines }: DeviceTableProps) {
  return (
    <table className="values-table">
      <thead>
        <tr>
          <th>Caractéristique</th>
          <th>Attendu</th>
          <th>Mesuré</th>
          <th aria-label="résultat" />
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.field}>
            <td>{LABELS[l.field] ?? l.field}</td>
            <td>{l.expected}</td>
            <td>{l.actual}</td>
            <td>
              {l.match ? (
                <span className="ok" aria-label="conforme">✓</span>
              ) : (
                <span className="ko" aria-label="différent">✗</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
