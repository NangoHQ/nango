/**
 * Produce the deploy-status snapshot consumed by the Slack `/deploy status` Lambda. Writes the
 * structured data (absolute ISO timestamps) plus a `generatedAt` to stdout as JSON, so the
 * snapshot workflow can redirect it to a file and upload to S3:
 *
 *   tsx scripts/deploy-status/snapshot.ts > deploy-status.json
 *
 * No rendering here — the Lambda renders relative dates/colors at read time so they stay live.
 */
import { collectStatus } from './report.ts';

const envs = await collectStatus();
const snapshot = { generatedAt: new Date().toISOString(), envs };
process.stdout.write(JSON.stringify(snapshot));
