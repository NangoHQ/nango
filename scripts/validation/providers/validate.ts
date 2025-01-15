/* eslint-disable no-console */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import jsYaml from 'js-yaml';
import Ajv from 'ajv';
import chalk from 'chalk';
import type { Provider } from '@nangohq/types';

// Function to recursively search for connectionConfig in the provider value
interface Ref {
    path: string[];
    key: string;
}

console.log('🕵️‍♂️ Validate providers.yaml');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pathSchema = path.join(__dirname, 'schema.json');
const pathProviders = path.join(__dirname, '../../../packages/providers/providers.yaml');

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

const invalidInterpolation = /(?<!(\$|]))\{/g;
for (const [providerKey, provider] of Object.entries(providersJson)) {
    // Skip validation for 'sage-intacct' provider, we need this so that we can specify the element attribute
    if (providerKey === 'sage-intacct') {
        continue;
    }
    const { credentials, connection_config, ...providerWithoutSensitive } = provider;
    const strippedProviderYaml = jsYaml.dump({ [providerKey]: providerWithoutSensitive });
    const match = [...strippedProviderYaml.matchAll(invalidInterpolation)];
    if (match.length > 0) {
        console.error(chalk.red('error'), 'Provider', chalk.blue(providerKey), `contains interpolation errors. A \`{\` does not have a \`$\` in front of it.`);
        process.exit(1);
    }
}

console.log('✅ JSON schema valid');

// Check if files exist
console.log('Checking values...');
const docsPath = path.join(__dirname, '../../../docs-v2/integrations/all');
const svgPath = path.join(__dirname, '../../../packages/webapp/public/images/template-logos');

// store a global flag so we don't stop at first error
let error = false;
for (const [providerKey, provider] of Object.entries(providersJson)) {
    validateProvider(providerKey, provider);
}

if (error) {
    console.error('❌ providers.yaml contains some errors');
    process.exit(1);
}

console.log('✅ All providers are valid');

// ---------------------- Helpers

/**
 * Validate one provider
 */
function validateProvider(providerKey: string, provider: Provider) {
    const filename = provider.docs.split('/').slice(-1)[0]; // filename could be different from providerConfigKey
    const mdx = path.join(docsPath, `${filename}.mdx`);
    const svg = path.join(svgPath, `${providerKey}.svg`);
    const connectMdx = path.join(docsPath, `${providerKey}/connect.mdx`);
    let hasValidConnect = false;
    const headers = new Set<string>();

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
    if (provider.docs_connect) {
        if (!fs.existsSync(connectMdx)) {
            console.error(chalk.red('error'), chalk.blue(providerKey), `Connect.mdx file not found`);
            console.error(`Expected file: ${connectMdx}`);
            error = true;
        } else {
            hasValidConnect = true;
            const content = fs.readFileSync(connectMdx).toString();
            const matched = content.matchAll(/^[#]+\sStep[a-zA-Z0-9:()._ -]+$/gim);
            for (const match of matched) {
                headers.add(
                    match[0]
                        .toLocaleLowerCase()
                        .replace(/^[#]+ /, '#')
                        .replaceAll(/\s/g, '-')
                        .replaceAll(/[:()._]/g, '')
                );
            }
        }
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

        // Check connection config validity
        for (const [key, schema] of Object.entries(provider.connection_config || [])) {
            if (schema.doc_section) {
                if (!provider.docs_connect) {
                    console.error(
                        chalk.red('error'),
                        chalk.blue(providerKey),
                        `"connection_config > ${key}" defines a "doc_section" but has no "docs_connect" property`
                    );
                    error = true;
                } else if (hasValidConnect) {
                    if (!headers.has(schema.doc_section)) {
                        console.error(
                            chalk.red('error'),
                            chalk.blue(providerKey),
                            `"connection_config > ${key} > doc_section" does not exist in ${providerKey}/connect.mdx`
                        );
                        error = true;
                    }
                }
            }
        }

        // Check credentials validity
        for (const [key, schema] of Object.entries(provider.credentials || [])) {
            if (schema.doc_section) {
                if (!provider.docs_connect) {
                    console.error(
                        chalk.red('error'),
                        chalk.blue(providerKey),
                        `"credentials > ${key}" defines a "doc_section" but has no "docs_connect" property`
                    );
                    error = true;
                } else if (hasValidConnect) {
                    if (!headers.has(schema.doc_section)) {
                        console.error(
                            chalk.red('error'),
                            chalk.blue(providerKey),
                            `"credentials > ${key} > doc_section" does not exist in ${providerKey}/connect.mdx`
                        );
                        error = true;
                    }
                }
            }
        }
    } else if (provider.connection_config) {
        console.error(chalk.red('error'), chalk.blue(providerKey), `"connection_config" is defined but not required`);
        error = true;
    }

    if (provider.auth_mode === 'API_KEY') {
        if (!provider.credentials?.['apiKey']) {
            console.error(chalk.red('error'), chalk.blue(providerKey), `"credentials" > "apiKey" is not defined`);
            error = true;
        }
        if (!provider.proxy?.verification) {
            console.warn(chalk.yellow('warning'), chalk.blue(providerKey), `does not have "proxy" > "verification" set`);
        }
    } else if (provider.auth_mode === 'BASIC' || provider.auth_mode === 'SIGNATURE') {
        if (!provider.credentials?.['username']) {
            console.warn(chalk.yellow('warning'), chalk.blue(providerKey), `"credentials" > "username" is not defined`);
        }
        if (!provider.credentials?.['password']) {
            console.warn(chalk.yellow('warning'), chalk.blue(providerKey), `"credentials" > "password" is not defined`);
        }
        if (!provider.proxy?.verification) {
            console.warn(chalk.yellow('warning'), chalk.blue(providerKey), `does not have "proxy" > "verification" set`);
        }
    } else if (provider.auth_mode === 'TWO_STEP') {
        if (!provider.credentials) {
            console.warn(chalk.yellow('warning'), chalk.blue(providerKey), `"credentials" are not defined for TWO_STEP auth mode`);
        }
    } else {
        if (provider.credentials) {
            console.error(chalk.red('error'), chalk.blue(providerKey), `"credentials" is defined but not required`);
            error = true;
        }
    }
}

/**
 * Recursively look for connectionConfig and check if they are well defined in connection_config
 */
function findConnectionConfigReferences(obj: Record<string, any>, path: string[] = []): Ref[] {
    const references: Ref[] = [];
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
            references.push(...findConnectionConfigReferences(value, [...path, key]));
        }
    }

    return references;
}
