import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

import type { NangoYaml } from '@nangohq/types';

import { determineVersion } from './helpers.js';
import type { NangoYamlParser } from './parser.js';
import { NangoYamlParserV1 } from './parser.v1';
import { NangoYamlParserV2 } from './parser.v2';

export * from './parser.js';
export * from './parser.v1.js';
export * from './parser.v2.js';
export * from './helpers.js';

const nangoConfigFile = 'nango.yaml';

/**
 * Load nango.yaml
 */
export function loadNangoYaml({ fullPath }: { fullPath: string }): NangoYamlParser {
    const location = path.resolve(`${fullPath}/${nangoConfigFile}`);
    try {
        const yamlConfig = fs.readFileSync(location, 'utf8');
        const raw = yaml.load(yamlConfig) as NangoYaml;
        const version = determineVersion(raw);

        if (version === 'v1') {
            return new NangoYamlParserV1({ raw });
        } else {
            return new NangoYamlParserV2({ raw });
        }
    } catch {
        throw new Error(`no nango.yaml config found at ${location}`);
    }
}
