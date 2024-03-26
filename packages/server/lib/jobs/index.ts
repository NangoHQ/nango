import { isCloud } from '@nangohq/internals/lib/environment/detection.js';
import { encryptionManager } from '@nangohq/shared';

export async function encryptDataRecords(): Promise<void> {
    if (isCloud()) {
        await encryptionManager.encryptAllDataRecords();
    }
}
