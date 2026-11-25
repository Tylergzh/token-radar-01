import { parseSnapshot, impliedValue, isPreToken, isRankable, buildBoard, farmSteps, liveRows, dataScript, boardIssue } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const inputArg = args.find(a => a.startsWith('--input='))?.split('=')[1] || 
                   (args.indexOf('--input') !== -1 ? args[args.indexOf('--input') + 1] : '/input');
  
  const snapshotPath = inputArg;
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR || './output';
  
  if (!fs.existsSync(snapshotPath)) {
    console.error(`Input snapshot not found: ${snapshotPath}`);
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  
  const board = buildBoard(snapshot);
  const issue = boardIssue(board);
  if (issue) {
    console.error(`Board validation failed: ${issue}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(path.join(outputDir, 'board.json'), JSON.stringify(board, null, 2));
  fs.writeFileSync(path.join(outputDir, 'data.js'), dataScript(snapshot, board));

  const assets = ['dashboard', 'screenshots'];
  for (const asset of assets) {
    const src = path.join(process.cwd(), asset);
    const dest = path.join(outputDir, asset);
    if (fs.existsSync(src)) {
      fs.mkdirSync(dest, { recursive: true });
      const files = fs.readdirSync(src);
      for (const file of files) {
        fs.copyFileSync(path.join(src, file), path.join(dest, file));
      }
    }
  }

  const dossier = buildDossier(outputDir, { text_max_bytes: 65536 });
  fs.writeFileSync(path.join(outputDir, 'dossier.json'), JSON.stringify(dossier, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
