import { createElement } from 'react';
import type { ArchivedFamily } from '../../profile/types';

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Build a standalone memorial page (inline SVG portraits + the game's stylesheet). */
export async function memorialHtml(family: ArchivedFamily): Promise<string> {
  // Loaded on demand so the server renderer isn't in the main bundle.
  const [{ renderToStaticMarkup }, { MemorialView }, css] = await Promise.all([
    import('react-dom/server'),
    import('./MemorialView'),
    import('../../styles.css?raw').then((m) => m.default as string),
  ]);
  const body = renderToStaticMarkup(createElement(MemorialView, { family }));
  const title = `The ${family.familyName} Family (${family.startYear}–${family.endYear})`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${css}
body { padding: 0 16px; }
.memorial { max-width: 640px; margin: 0 auto; padding: 24px 0 48px; }
.exported-note { text-align: center; color: var(--muted); font-size: 0.8rem; margin-top: 24px; }
</style>
</head>
<body>
<main class="memorial">${body}
<p class="exported-note">A family memorial from Family Tree · ${escapeHtml(new Date().toISOString().slice(0, 10))}</p>
</main>
</body>
</html>`;
}

export async function downloadMemorial(family: ArchivedFamily) {
  const name = family.familyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const html = await memorialHtml(family);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `memorial-${name}-${family.startYear}-${family.endYear}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

