export function errorToObject(err: unknown) {
    if ('response' in (err as any)) {
        return (err as any).response.data;
    }
    if (err instanceof Error) {
        return JSON.parse(JSON.stringify(err, ['name', 'message']));
    }
    return err;
}
