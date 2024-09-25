import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import jsYaml from 'js-yaml';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log('Validate');
const pathSchema = path.join(__dirname, 'schema.json');
const pathProviders = path.join(__dirname, '../../../packages/shared/providers.yaml');

// Schema
const ajv = new Ajv({ allErrors: true, discriminator: true });
const schemaJson = fs.readFileSync(pathSchema);
const validator = ajv.compile(JSON.parse(schemaJson.toString()));
console.log('loaded schema.json', pathSchema);

// Providers
const providersYaml = fs.readFileSync(pathProviders);
console.log('loaded providers.yaml', pathProviders, providersYaml.toString().length);
const providersJson = jsYaml.load(providersYaml.toString());
console.log('parsed providers', Object.keys(providersJson));

// Validation
console.log('validating');
validator(providersJson);
if (validator.errors) {
    console.error('error', validator.errors);
    process.exit(1);
}

// Check if doc files exist
console.log('Checking if docs files exist');
const docsPath = path.join(__dirname, '../../../docs-v2/integrations/all');

for (const [providerKey, providerValue] of Object.entries(providersJson)) {
    const filename = providerValue.docs.split('/').slice(-1)[0];
    const mdx = `${filename}.mdx`;
    const docFilePath = path.join(docsPath, mdx);

    if (!fs.existsSync(docFilePath)) {
        console.error(`Documentation file not found for provider: ${providerKey}`);
        console.error(`Expected file: ${docFilePath}`);
        process.exit(1);
    }
}

console.log('All documentation files exist');
