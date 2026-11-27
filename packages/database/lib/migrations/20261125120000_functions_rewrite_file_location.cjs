exports.config = { transaction: false };

const NODE_ENV = process.env['NODE_ENV'];
const ENV_PREFIX = NODE_ENV === 'staging' ? 'staging' : NODE_ENV === 'production' ? 'production' : 'development';
const COPY_CONCURRENCY = 50;
const BATCH_SIZE = 100;

async function readIfPresent(remoteFiles, key) {
    try {
        return await remoteFiles.getFile(key);
    } catch (err) {
        const status = err?.$metadata?.httpStatusCode ?? err?.statusCode;
        if (err?.code === 'NoSuchKey' || err?.code === 404 || status === 404) {
            return null;
        }
        throw err;
    }
}

async function copyArtifact(remoteFiles, source, destination) {
    const sourceContent = await readIfPresent(remoteFiles, source);
    if (sourceContent === null) {
        if ((await readIfPresent(remoteFiles, destination)) !== null) {
            return true;
        }
        console.warn(`Function artifact missing at both ${source} and ${destination}; skipping.`);
        return false;
    }
    const copied = await remoteFiles.copy({ sourcePath: source, destinationPath: destination });
    if (copied !== destination) {
        throw new Error(`Function artifact copy failed: ${source}`);
    }
    if ((await remoteFiles.getFile(destination)) !== sourceContent) {
        throw new Error(`Function artifact copy verification failed: ${destination}`);
    }
    return true;
}

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    // Find all function artifacts that are not already with the correct prefix.
    const rows = await knex('function_config_versions')
        .distinct('file_location')
        .whereNot('file_location', '_LOCAL_FILE_')
        .whereNot('file_location', 'like', `${ENV_PREFIX}/%`);

    // Map source file locations to destination file locations.
    const copies = new Map();
    const jsLocations = [];
    for (const { file_location: source } of rows) {
        if (!/^[^/]+\/.+\.js$/.test(source)) {
            console.warn(`Unexpected function file location: ${source}; skipping.`);
            continue;
        }
        jsLocations.push(source);
        copies.set(source, source.replace(/^[^/]+\//, `${ENV_PREFIX}/`));
        const sourceTs = source.replace(/\.js$/, '.ts');
        copies.set(sourceTs, sourceTs.replace(/^[^/]+\//, `${ENV_PREFIX}/`));
    }
    if (jsLocations.length === 0) {
        return;
    }

    const { default: remoteFiles } = await import('@nangohq/shared/dist/services/file/remote.service.js');

    // Commit each batch separately so retries skip completed work.
    for (let offset = 0; offset < jsLocations.length; offset += BATCH_SIZE) {
        const batch = jsLocations.slice(offset, offset + BATCH_SIZE);
        const entries = batch.flatMap((source) => {
            const sourceTs = source.replace(/\.js$/, '.ts');
            return [
                [source, copies.get(source)],
                [sourceTs, copies.get(sourceTs)]
            ];
        });
        const skipped = new Set();
        let next = 0;
        const results = await Promise.allSettled(
            Array.from({ length: Math.min(COPY_CONCURRENCY, entries.length) }, async () => {
                while (next < entries.length) {
                    const [source, destination] = entries[next++];
                    if (!(await copyArtifact(remoteFiles, source, destination))) {
                        skipped.add(source);
                    }
                }
            })
        );
        const failed = results.find((result) => result.status === 'rejected');
        if (failed) {
            throw failed.reason;
        }

        const copied = batch.filter((location) => !skipped.has(location));
        if (copied.length === 0) {
            continue;
        }
        await knex.raw(
            `UPDATE "function_config_versions" AS versions
            SET "file_location" = paths.destination
            FROM unnest(?::text[], ?::text[]) AS paths(source, destination)
            WHERE versions."file_location" = paths.source`,
            [copied, copied.map((location) => copies.get(location))]
        );
    }

    // Keep old artifacts for apps that may still be running old versions,
    // for example, self-managed that upgrades directly to this version
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
