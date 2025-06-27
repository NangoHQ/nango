import type { NangoAction } from '../../models.js';

export default async function runAction(nango: NangoAction): Promise<void> {
    await nango.log('Creating contact...');
}
