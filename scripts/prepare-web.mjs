import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const archive = path.join(root, 'dopamine-reset-pwa.zip');
const extracted = path.join(root, '.build', 'pwa');
const webDir = path.join(root, 'www');

await rm(path.join(root, '.build'), { recursive: true, force: true });
await rm(webDir, { recursive: true, force: true });
await mkdir(extracted, { recursive: true });
execFileSync('unzip', ['-q', archive, '-d', extracted], { stdio: 'inherit' });

const entries = await readdir(extracted, { withFileTypes: true });
const appDirectory = entries.find((entry) => entry.isDirectory());
if (!appDirectory) throw new Error('The uploaded PWA archive has no root directory.');

await cp(path.join(extracted, appDirectory.name), webDir, { recursive: true });

const indexPath = path.join(webDir, 'index.html');
let html = await readFile(indexPath, 'utf8');
const appScript = '<script src="app.js" defer></script>';
if (!html.includes(appScript)) throw new Error('Could not find app.js in index.html.');
html = html.replace(appScript, '<script src="native.js" defer></script>\n  ' + appScript);
await writeFile(indexPath, html, 'utf8');

console.log('PWA extracted and native adapter injected.');
