import { uploadTelemetryDaemon } from './daemons/uploadTelemetry.daemon.js';

export async function boot(): Promise<{ uploadTelemetry: Awaited<ReturnType<typeof uploadTelemetryDaemon>> }> {
    return { uploadTelemetry: await uploadTelemetryDaemon() };
}
