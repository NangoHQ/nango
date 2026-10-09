// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture only, avoids the circular NangoSyncLocal-from-exec type
export async function execWithCheckpoint(nango: any): Promise<void> {
    const checkpoint = await nango.getCheckpoint();
    const from = checkpoint ? `from=${checkpoint.lastSyncedIssueId}` : '';
    await nango.get({ endpoint: `/nangohq/nango/issues?${from}` });
    await nango.saveCheckpoint({ lastSyncedIssueId: '123' });
}
