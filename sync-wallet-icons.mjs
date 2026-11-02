import { writeFile } from 'node:fs/promises';

const sources = {
  Phantom: 'https://unpkg.com/@solana/wallet-adapter-phantom@0.9.30/lib/esm/adapter.js',
  Solflare: 'https://unpkg.com/@solana/wallet-adapter-solflare@0.6.34/lib/esm/adapter.js',
  Backpack: 'https://unpkg.com/@solana/wallet-adapter-backpack@0.1.14/lib/esm/adapter.js',
};

const icons = {};
for (const [name, url] of Object.entries(sources)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load official ${name} adapter source`);
  const source = await response.text();
  const match = source.match(/this\.icon = '([^']+)'/);
  if (!match) throw new Error(`Official ${name} icon was not found`);
  icons[name] = match[1];
}

const notice = `/* Generated from the official Solana Wallet Adapter packages.\n${Object.entries(sources).map(([name, url]) => ` * ${name}: ${url}`).join('\n')}\n */\n`;
await writeFile('wallet-icons.js', `${notice}window.JOLT_OFFICIAL_WALLET_ICONS = Object.freeze(${JSON.stringify(icons, null, 2)});\n`, 'utf8');
