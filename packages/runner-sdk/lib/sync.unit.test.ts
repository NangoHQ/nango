/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import type { NangoSyncBase } from './sync.js';

// Example Zod model
const UserModel = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string()
});
type User = z.infer<typeof UserModel>;
interface Models {
    user: typeof UserModel;
    [key: string]: typeof UserModel;
}

describe('NangoSyncBase type signatures', () => {
    describe('batchSave', () => {
        it('accepts a full model', () => {
            expectTypeOf<NangoSyncBase<Models>['batchSave']>().parameter(0).toEqualTypeOf<User[]>();
        });
        it('should not allow missing id', () => {
            interface NoId {
                name: string;
            }
            // @ts-expect-error: id is required
            expectTypeOf<NangoSyncBase<Models>['batchSave']>().parameter(0).toEqualTypeOf<NoId[]>();
        });
    });

    describe('batchDelete', () => {
        it('should accepts models with id', () => {
            expectTypeOf<NangoSyncBase<Models>['batchDelete']>().parameter(0).toEqualTypeOf<(Pick<User, 'id'> & Partial<User>)[]>();
        });
        it('should not allow missing id', () => {
            interface NoId {
                name: string;
            }
            // @ts-expect-error: id is required
            expectTypeOf<NangoSyncBase<Models>['batchDelete']>().parameter(0).toEqualTypeOf<NoId[]>();
        });
    });

    describe('batchUpdate', () => {
        it('should accepts models with id', () => {
            expectTypeOf<NangoSyncBase<Models>['batchUpdate']>().parameter(0).toEqualTypeOf<(Pick<User, 'id'> & Partial<User>)[]>();
        });
        it('should not allow missing id', () => {
            interface NoId {
                name: string;
            }
            // @ts-expect-error: id is required
            expectTypeOf<NangoSyncBase<Models>['batchUpdate']>().parameter(0).toEqualTypeOf<NoId[]>();
        });
    });
});
