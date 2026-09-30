import type { NangoSync } from 'nango';

export async function syncIssues(nango: NangoSync): Promise<void> {
    const checkpoint = await nango.getCheckpoint();
    const from = checkpoint ? `from=${checkpoint.lastSyncedIssueId}` : '';
    await nango.get({ endpoint: `/nangohq/nango/issues?${from}` });
    await nango.saveCheckpoint({ lastSyncedIssueId: '123' });
}
