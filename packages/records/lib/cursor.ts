export interface Cursor {
    sort: string;
    id: string;
}

const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Cursor = {
    new({ last_modified_at, id }: { last_modified_at: string; id: string }): string {
        return Buffer.from(`${last_modified_at}||${id}`).toString('base64');
    },
    from(encoded: string): Cursor | undefined {
        const decoded = Buffer.from(encoded, 'base64').toString('ascii');
        const [cursorSort, cursorId] = decoded.split('||');
        if (cursorSort && cursorId && ISO_TIMESTAMP_RE.test(cursorSort) && UUID_RE.test(cursorId)) {
            return { sort: cursorSort, id: cursorId };
        }
        return undefined;
    }
};
