export interface Cursor {
    sort: string;
    id: string;
}

export const Cursor = {
    new({ last_modified_at, id }: { last_modified_at: string; id: string }): string {
        return Buffer.from(`${last_modified_at}||${id}`).toString('base64');
    },
    from(encoded: string): Cursor | undefined {
        const decoded = Buffer.from(encoded, 'base64').toString('ascii');
        const [cursorSort, cursorId] = decoded.split('||');
        if (cursorSort && cursorId) {
            return { sort: cursorSort, id: cursorId };
        }
        return undefined;
    }
};
