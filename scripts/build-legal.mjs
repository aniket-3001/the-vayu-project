// Turns docs/PRIVACY-POLICY.md and docs/TERMS.md into the two plain pages the site and the stores link to
// (apps/web/public/privacy.html and terms.html). The Markdown files stay the one source of the wording.
//
// It handles only what those two files use: headings, paragraphs, bullet lists, tables, quotes, **bold**, `code`
// and [links](url). Text is escaped first, so nothing in the Markdown can become script. The page has no script and
// loads nothing from anywhere else, so it fits the site's strict content policy.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const escapeHtml = (text) =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');

/** Inline formatting on text that is escaped first. Links are limited to https, mailto and in-page addresses. */
export function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:https:\/\/|mailto:|\/)[^)\s]*)\)/gu, '<a href="$2">$1</a>');
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/gu, '')
    .split('|')
    .map((c) => c.trim());

/** Markdown to an HTML fragment. A quote straight after the title (notes for the owner) is left out of the published page. */
export function toHtml(markdown) {
  const lines = markdown.replace(/\r\n/gu, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i += 1;
    } else if (line.startsWith('>')) {
      const quote = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        quote.push((lines[i] ?? '').replace(/^>\s?/u, ''));
        i += 1;
      }
      if (out.length > 1) out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
    } else if (/^#{1,3} /u.test(line)) {
      const level = line.indexOf(' ');
      out.push(`<h${String(level)}>${inline(line.slice(level + 1))}</h${String(level)}>`);
      i += 1;
    } else if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('|')) {
        rows.push(lines[i] ?? '');
        i += 1;
      }
      const [head = '', , ...body] = rows;
      const th = cells(head)
        .map((c) => `<th scope="col">${inline(c)}</th>`)
        .join('');
      const tr = body
        .map((row) => `<tr>${cells(row).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="wide"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
    } else if (/^- /u.test(line)) {
      const items = [];
      while (i < lines.length && /^- /u.test(lines[i] ?? '')) {
        let item = (lines[i] ?? '').slice(2);
        i += 1;
        while (i < lines.length && /^ {2,}\S/u.test(lines[i] ?? '')) {
          item += ` ${(lines[i] ?? '').trim()}`;
          i += 1;
        }
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(`<ul>${items.join('')}</ul>`);
    } else {
      const para = [];
      while (
        i < lines.length &&
        (lines[i] ?? '').trim() !== '' &&
        !/^(#{1,3} |- |\||>)/u.test(lines[i] ?? '')
      ) {
        para.push((lines[i] ?? '').trim());
        i += 1;
      }
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

const STYLE = `
:root{color-scheme:light dark;--bg:#fbfaf7;--fg:#1d1d1b;--mut:#5b5b55;--line:#dcd9d0}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mut:#a5a49b;--line:#3a3a35}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:46rem;margin:0 auto;padding:1.5rem 16px 4rem}
h1{font-size:1.7rem;line-height:1.25}h2{font-size:1.2rem;margin-top:2rem}
a{color:inherit}code{font-size:.9em}blockquote{margin:1rem 0;padding:.1rem 1rem;border-left:3px solid var(--line);color:var(--mut)}
.wide{overflow-x:auto}table{border-collapse:collapse;font-size:.88rem;min-width:44rem}
th,td{border:1px solid var(--line);padding:.4rem .55rem;text-align:left;vertical-align:top}
nav{font-size:.9rem;margin-bottom:1rem}
`;

export function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · The Vayu Project</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<nav><a href="/">← Back to the app</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></nav>
${body}
</main>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = resolve(root, 'apps/web/public');
  mkdirSync(outDir, { recursive: true });
  for (const [source, target, title] of [
    ['docs/PRIVACY-POLICY.md', 'privacy.html', 'Privacy policy'],
    ['docs/TERMS.md', 'terms.html', 'Terms of use'],
  ]) {
    const html = page(title, toHtml(readFileSync(resolve(root, source), 'utf8')));
    if (/\[[^\]]*(to be|fill|confirm)[^\]]*\]/iu.test(html)) {
      console.error(`build-legal: ${source} still has a bracketed note to fill in. Fix the wording first.`);
      process.exit(1);
    }
    writeFileSync(resolve(outDir, target), html);
    console.log(`build-legal: wrote apps/web/public/${target}`);
  }
}
