import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';

import { nangoConfigFile } from './constant.js';
import { determineVersion } from './helpers.js';
import { NangoYamlParserV1 } from './parser.v1.js';
import { NangoYamlParserV2 } from './parser.v2.js';

import type { NangoYamlParser } from './parser.js';
import type { NangoYaml } from '@nangohq/types';

/**
 * Load nango.yaml
 */
export function loadNangoYaml({ fullPath }: { fullPath: string }): NangoYamlParser {
    const location = path.resolve(fullPath, nangoConfigFile);
    try {
        const content = fs.readFileSync(location, 'utf8');
        const raw = yaml.load(content) as NangoYaml;
        const version = determineVersion(raw);

        if (version === 'v1') {
            return new NangoYamlParserV1({ raw, yaml: content });
        } else {
            return new NangoYamlParserV2({ raw, yaml: content });
        }
    } catch {
        throw new Error(`no nango.yaml config found at ${location}`);
    }
}
