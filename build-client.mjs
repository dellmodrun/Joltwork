import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

await build({
  entryPoints: ['launch-client.ts'],
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'JoltworkLaunch',
  inject: ['buffer-shim.js'],
  outfile: 'launch-client.js',
});

const output = await readFile('launch-client.js', 'utf8');
await writeFile('launch-client.js', output.replace(/[ \t]+$/gm, ''), 'utf8');
