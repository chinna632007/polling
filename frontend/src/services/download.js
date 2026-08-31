/**
 * Shared helper: download a protected report/Excel file while keeping the
 * JWT in the Authorization header (plain <a href> would lose the token).
 * The saved filename comes from the server's Content-Disposition header
 * when available, with a URL-based fallback.
 */
export async function docDownload(url, fallbackName = 'report') {
  const token = localStorage.getItem('token');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    alert('Report could not be downloaded. Please try again.');
    return;
  }

  const blob = await response.blob();

  // Preferred: server-provided name (attachment; filename="x.xlsx").
  let filename = '';
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (match) {
    filename = decodeURIComponent(match[1].replace(/"/g, ''));
  }
  if (!filename) {
    const last = url.split('/').filter(Boolean).pop() || fallbackName;
    filename = last.endsWith('.xlsx') ? last : `${last}.xlsx`;
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export default docDownload;