// Production entrypoint (render.yaml startCommand): find the database URLs,
// apply migrations, then start the API.
//
// The URLs are pasted by hand into the Render dashboard, and Neon's Connect
// dialog offers them wrapped in snippets (`psql '…'`, `DATABASE_URL=…`, or the
// whole multi-line Prisma block with both variables). Prisma rejects anything
// that isn't a bare URL (P1013), so pull the postgres:// URLs out of whatever
// was pasted into DATABASE_URL / DIRECT_URL. The pooled URL (`-pooler` host)
// serves queries; the direct one runs migrations and is derived when absent.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const URL_RE = /postgres(?:ql)?:\/\/[^\s'"`]+/g;

function labelled(text, key) {
  const m = text.match(new RegExp(`\b${key}\s*[=:]\s*['"]?(postgres(?:ql)?://[^\s'"\`]+)`));
  return m ? m[1] : undefined;
}

function resolveDbUrls(env) {
  const text = [env.DATABASE_URL, env.DIRECT_URL].map((v) => String(v ?? '')).join('\n');
  const urls = text.match(URL_RE) ?? [];
  const url =
    labelled(text, 'DATABASE_URL') ?? urls.find((u) => u.includes('-pooler.')) ?? urls[0] ?? '';
  const direct =
    labelled(text, 'DIRECT_URL') ??
    urls.find((u) => !u.includes('-pooler.')) ??
    url.replace('-pooler.', '.');
  return { url, direct };
}

// Shape of a value without revealing it, for the deploy log.
function describe(name, value) {
  if (value == null) return `${name}: not set`;
  const s = String(value);
  if (!s.trim()) return `${name}: empty`;
  return `${name}: ${s.length} chars, ${s.split(/\r?\n/).length} line(s), no postgres:// URL inside`;
}

function main() {
  const { url, direct } = resolveDbUrls(process.env);
  if (!url) {
    console.error('No postgresql:// URL found in DATABASE_URL or DIRECT_URL — fix them in the Render dashboard (Environment).');
    console.error(describe('DATABASE_URL', process.env.DATABASE_URL));
    console.error(describe('DIRECT_URL', process.env.DIRECT_URL));
    process.exit(1);
  }
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = direct;

  const prismaPkg = require.resolve('prisma/package.json');
  const prismaCli = path.join(path.dirname(prismaPkg), require(prismaPkg).bin.prisma);
  const migrate = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
  });
  if (migrate.status !== 0) process.exit(migrate.status ?? 1);

  require(path.join(__dirname, '..', 'dist', 'src', 'main.js'));
}

if (require.main === module) main();

module.exports = { resolveDbUrls, describe };
