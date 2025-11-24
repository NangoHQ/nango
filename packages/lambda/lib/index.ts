import { getLocking } from '@nangohq/kvstore';
import { KVLocks, exec } from '@nangohq/runner';

import type { requestSchema } from './schemas.js';
import type { NangoProps } from '@nangohq/types';
import type { Context } from 'aws-lambda';
import type * as zod from 'zod';

export const handler = async (event: zod.infer<typeof requestSchema>, _context: Context) => {
    const result = await exec({
        nangoProps: event.nangoProps as unknown as NangoProps,
        code: event.code,
        codeParams: event.codeParams,
        locks: new KVLocks(await getLocking())
    });
    return result;
};
