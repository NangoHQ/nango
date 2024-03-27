import { isCloud } from '@nangohq/utils/dist/environment/detection.js';
import { encryptionManager } from '@nangohq/shared';

export async function encryptDataRecords(): Promise<void> {
    if (isCloud) {
        await encryptionManager.encryptAllDataRecords();
    }
}
