import { isCloud } from '@nangohq/utils';
import { encryptionManager } from '@nangohq/shared';

export async function encryptDataRecords(): Promise<void> {
    if (isCloud) {
        await encryptionManager.encryptAllDataRecords();
    }
}
