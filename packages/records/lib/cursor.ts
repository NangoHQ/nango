import * as z from 'zod';

export interface Cursor {
    sort: string;
    id: string;
}

const cursorSchema = z
    .object({
        sort: z.string().datetime({ offset: true }),
        id: z.string().uuid()
    })
    .strict();

export const Cursor = {
    new({ last_modified_at, id }: { last_modified_at: string; id: string }): string {
        return Buffer.from(`${last_modified_at}||${id}`).toString('base64');
    },
    from(encoded: string): Cursor | undefined {
        const decoded = Buffer.from(encoded, 'base64').toString('ascii');
        const cursorParts = decoded.split('||');
        if (cursorParts.length !== 2) {
            return undefined;
        }

        const [cursorSort, cursorId] = cursorParts;
        const parsed = cursorSchema.safeParse({ sort: cursorSort, id: cursorId });

        if (parsed.success) {
            return parsed.data;
        }

        return undefined;
    }
};
