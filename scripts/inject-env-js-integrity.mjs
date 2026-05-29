#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const indexHtmlPath = process.argv[2] ?? 'packages/webapp/dist/index.html';
const apiDomain = process.argv[3] ?? process.env.API_DOMAIN;

if (!apiDomain) {
    console.error('Usage: API_DOMAIN=<domain> node scripts/inject-env-js-integrity.mjs [index.html path] [api domain]');
    process.exit(1);
}

const html = fs.readFileSync(indexHtmlPath, 'utf8');
const hashMatch = html.match(/\/env\.js\?hash=([^"]+)/);

if (!hashMatch) {
    console.error(`No env.js script tag found in ${indexHtmlPath}`);
    process.exit(1);
}

const hash = hashMatch[1];
const envJsUrl = `${apiDomain.replace(/\/$/, '')}/env.js?hash=${hash}`;
const response = await fetch(envJsUrl);

if (!response.ok) {
    console.error(`Failed to fetch env.js from ${envJsUrl}: ${response.status} ${response.statusText}`);
    process.exit(1);
}

const envJsContent = await response.text();
const integrity = `sha384-${createHash('sha384').update(envJsContent).digest('base64')}`;
const scriptTagPattern = /<script\s+src="\/env\.js\?hash=[^"]*"\s*><\/script>/;
const scriptTag = `<script src="${envJsUrl}" integrity="${integrity}" crossorigin="anonymous"></script>`;

if (!scriptTagPattern.test(html)) {
    console.error(`No env.js script tag found in ${indexHtmlPath}`);
    process.exit(1);
}

fs.writeFileSync(indexHtmlPath, html.replace(scriptTagPattern, scriptTag));
console.log(`Injected env.js integrity into ${indexHtmlPath}`);
