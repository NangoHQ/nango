/* eslint-disable no-console */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import jsYaml from 'js-yaml';
import Ajv from 'ajv';
import chalk from 'chalk';
import type { Provider } from '@nangohq/types';

console.log('🕵️‍♂️ Validate providers.yaml');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const providersJson = jsYaml.load(providersYaml.toString()) as Record<string, Provider>;
console.log('parsed providers', Object.keys(providersJson));

// Validation
console.log('validating...');
validator(providersJson);
if (validator.errors) {
    console.error(chalk.red('error'), validator.errors);
    process.exit(1);
}

console.log('✅ JSON schema valid');

// Check if files exist
console.log('Checking values...');
const docsPath = path.join(__dirname, '../../../docs-v2/integrations/all');
const svgPath = path.join(__dirname, '../../../packages/webapp/public/images/template-logos');

let error = false;
for (const [providerKey, provider] of Object.entries(providersJson)) {
    const filename = provider.docs.split('/').slice(-1)[0];
    const mdx = path.join(docsPath, `${filename}.mdx`);
    const svg = path.join(svgPath, `${providerKey}.svg`);

    if (!fs.existsSync(mdx)) {
        console.error(chalk.red('error'), chalk.blue(providerKey), `Documentation file not found`);
        console.error(`Expected file: ${mdx}`);
        error = true;
    }
    if (!fs.existsSync(svg)) {
        console.error(chalk.red('error'), chalk.blue(providerKey), `SVG file not found`);
        console.error(`Expected file: ${svg}`);
        error = true;
    }

    // Find all connectionConfig references
    const connectionConfigReferences = findConnectionConfigReferences(provider);

    // Check if referenced connectionConfig keys exist in the connection_config property
    if (connectionConfigReferences.length > 0) {
        for (const reference of connectionConfigReferences) {
            const defined = provider.connection_config && reference.key in provider.connection_config;
            const inTokenResponseMetadata = provider.token_response_metadata?.includes(reference.key);

            if (!defined && !inTokenResponseMetadata) {
                console.error(
                    chalk.red('error'),
                    chalk.blue(providerKey),
                    `"${reference.path.join('" > "')}" use "connectionConfig.${reference.key}", but it's not defined in "connection_config"`
                );
                error = true;
                continue;
            }
        }
    } else if (provider.connection_config) {
        console.error(chalk.red('error'), chalk.blue(providerKey), `"connection_config" is defined but not required`);
        error = true;
    }

    if (provider.auth_mode === 'API_KEY') {
        if (!provider?.credentials?.['apiKey']) {
            console.error(chalk.red('error'), chalk.blue(providerKey), `"credentials" > "apiKey" is not defined`);
            error = true;
        }
    } else {
        if (provider.credentials) {
            console.error(chalk.red('error'), chalk.blue(providerKey), `"credentials" is defined but not required`);
            error = true;
        }
    }
}

// Function to recursively search for connectionConfig in the provider value
interface Ref {
    path: string[];
    key: string;
}
function findConnectionConfigReferences(obj: Record<string, any>, path: string[] = []): Ref[] {
    let references: Ref[] = [];
    if (!(typeof obj === 'object') || !obj) {
        return references;
    }

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            const matches = value.matchAll(/\$\{connectionConfig\.([^}]+)\}/g);
            for (const match of matches) {
                references.push({ path: [...path, key], key: match[1]! });
            }
        } else if (typeof value === 'object' && value) {
            references = references.concat(findConnectionConfigReferences(value, [...path, key]));
        }
    }

    return references;
}

if (error) {
    console.log('❌ providers.yaml contains some errors');
    process.exit(1);
}

console.log('✅ All providers are valid');
