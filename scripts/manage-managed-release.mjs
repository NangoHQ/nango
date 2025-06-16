import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import semver from 'semver';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.join(process.cwd(), 'managed-manifest.json');

function readManifest() {
    const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(manifestContent);
}

function writeManifest(manifest) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function getAppVersion() {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    return packageJson.version;
}

function getChangesSinceLastRelease(lastCommitHash) {
    try {
        const changes = execSync(`git log ${lastCommitHash}..HEAD --pretty=format:"%s"`).toString().split('\n');
        return changes.filter((change) => change.trim() !== '');
    } catch (err) {
        console.error('Error getting changes:', err);
        return [];
    }
}

function determineImageVersion(manifest, appVersion, forceMajorBump = false) {
    const lastImageVersion = manifest.latest.imageVersion;
    const lastAppVersion = manifest.latest.appVersion;

    // If force major bump is requested, bump major version
    if (forceMajorBump) {
        return `${semver.major(lastImageVersion) + 1}.0.0`;
    }

    // If app version is a major version bump, bump image major version
    if (semver.major(appVersion) > semver.major(lastAppVersion)) {
        return `${semver.major(lastImageVersion) + 1}.0.0`;
    }

    // If app version is a minor version bump, bump image minor version
    if (semver.minor(appVersion) > semver.minor(lastAppVersion)) {
        return `${semver.major(lastImageVersion)}.${semver.minor(lastImageVersion) + 1}.0`;
    }

    // Otherwise, bump patch version
    return `${semver.major(lastImageVersion)}.${semver.minor(lastImageVersion)}.${semver.patch(lastImageVersion) + 1}`;
}

function updateManifest(commitHash, forceMajorBump = false) {
    const manifest = readManifest();
    const appVersion = getAppVersion();
    const imageVersion = determineImageVersion(manifest, appVersion, forceMajorBump);
    const changes = getChangesSinceLastRelease(manifest.latest.commitHash);

    // Move current latest to history
    manifest.history.push({ ...manifest.latest });

    // Update latest
    manifest.latest = {
        imageVersion,
        appVersion,
        commitHash,
        releaseDate: new Date().toISOString(),
        changes
    };

    writeManifest(manifest);
    console.log(`Updated manifest with image version ${imageVersion} for app version ${appVersion}`);
}

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const commitHash = process.argv[2];
    if (!commitHash) {
        console.error('Please provide a commit hash');
        process.exit(1);
    }
    const forceMajorBump = process.argv.includes('--bump-major');
    updateManifest(commitHash, forceMajorBump);
} 