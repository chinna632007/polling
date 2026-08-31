import { docDownload } from '../services/download';

/**
 * Reports page - every report is generated server-side as an .xlsx download.
 */
const REPORTS = [
  {
    title: 'Officer List',
    desc: 'Complete officer master data (Excel)',
    url: '/api/reports/officers-excel',
    icon: '👤',
  },
  {
    title: 'Booth List',
    desc: 'All polling booths with capacity status (Excel)',
    url: '/api/reports/booths-excel',
    icon: '🏛️',
  },
  {
    title: 'Allocated Officers',
    desc: 'Officers assigned to booths with compatibility scores (Excel)',
    url: '/api/reports/allocation-excel',
    icon: '✅',
  },
  {
    title: 'Unallocated Officers',
    desc: 'Officers who could not be allocated (Excel)',
    url: '/api/reports/unallocated-officers',
    icon: '⚠️',
  },
  {
    title: 'Notification Status Report',
    desc: 'SMS delivery status for all messages (Excel)',
    url: '/api/reports/notifications-excel',
    icon: '✉️',
  },
];

export default function Reports() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Download Excel reports generated from live data</p>
        </div>
      </div>

      <div className="report-grid">
        {REPORTS.map((report) => (
          <div key={report.title} className="card report-card">
            <div className="report-icon" aria-hidden="true">
              {report.icon}
            </div>
            <h3 className="card-title">{report.title}</h3>
            <p className="report-desc">{report.desc}</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => docDownload(report.url)}
            >
              Download .xlsx
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}