// import { createRequire } from 'node:module';
import path from 'node:path';

import { Ok } from '../../utils/result.js';

import type { NangoYamlParsed, Result } from '@nangohq/types';

// const require = createRequire(import.meta.url);

export async function rebuildParsed({ fullPath }: { fullPath: string; debug: boolean }): Promise<Result<NangoYamlParsed>> {
    const content = await import(path.join(fullPath, 'build', 'index.cjs'));
    console.log(content);
    const parsed: NangoYamlParsed = { yamlVersion: 'v2', integrations: [], models: new Map() };

    return Ok(parsed);
}
