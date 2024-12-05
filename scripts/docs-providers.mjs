import fs from 'node:fs';
import yaml from 'js-yaml';

const providersPath = 'packages/shared/providers.yaml';
const providersMdxPath = 'docs-v2/snippets/providers.mdx';

if (!fs.existsSync(providersPath)) {
    console.error(`Providers file not found: ${providersPath}`);
    process.exit(1);
}

const providers = yaml.load(fs.readFileSync(providersPath, 'utf-8'));

fs.writeFileSync(providersMdxPath, `export const providers = ${JSON.stringify(providers, null, 4)};\n`, 'utf-8');
