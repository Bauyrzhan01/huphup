// Production entrypoint (render.yaml startCommand): tidy the database URLs,
// apply migrations, then start the API.
//
// The URLs are pasted by hand into the Render dashboard, and Neon's Connect
// dialog offers them as `psql '…'` or `DATABASE_URL=…` snippets that Prisma
// rejects with P1013. Accept those forms. DIRECT_URL (unpooled, used only by
// migrations) is the same URL without `-pooler` in the host, so derive it when
// it is empty or unusable.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCHEME = /^postgres(ql)?:\/\//;

function cleanDbUrl(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^[A-Z_]+\s*=\s*/, '')
    .replace(/^psql\s+/, '')
    .replace(/^(['"])([\s\S]*)\1$/, '$2')
    .trim();
}

function resolveDbUrls(env) {
  const url = cleanDbUrl(env.DATABASE_URL);
  let direct = cleanDbUrl(env.DIRECT_URL);
  if (!SCHEME.test(direct) && SCHEME.test(url)) {
    direct = url.replace('-pooler.', '.');
  }
  return { url, direct };
}

function main() {
  const { url, direct } = resolveDbUrls(process.env);
  if (!SCHEME.test(url)) {
    console.error(
      'DATABASE_URL is not a postgresql:// URL — fix it in the Render dashboard (Environment).',
    );
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

module.exports = { cleanDbUrl, resolveDbUrls };
