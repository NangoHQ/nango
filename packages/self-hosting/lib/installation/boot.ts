import { uploadTelemetryCron } from './crons/uploadTelemetry.js';

export async function boot(): Promise<void> {
    await uploadTelemetryCron();
}
