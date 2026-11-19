// SOLMAR entry program: copies game/ and screenshots/ from this repository
// into the output directory and writes dossier.json with the SDK's
// buildDossier. Two runs over the same files produce the same bytes: no
// timestamps or random values are written anywhere.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(outDir, name), { recursive: true, force: true });
}
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, caps));
console.log('wrote ' + outDir + '/dossier.json');
