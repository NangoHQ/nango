import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const {
    GITHUB_TOKEN,
    TAG_NAME,
    IMAGE_VERSION,
    APP_VERSION,
    COMMIT_HASH,
    MANIFEST_PATH = path.join(REPO_ROOT, 'managed-manifest.json'),
    NANGO_REPO_PATH = REPO_ROOT,
    MANAGED_RELEASES_REPO_PATH = path.join(REPO_ROOT, 'managed-image-releases'),
    TARGET_REPO = 'NangoHQ/managed-image-releases',
    GH_HOST = 'github.com',
    ACT
} = process.env;

const COMMIT_HASH_PATTERN = /^[a-f0-9]{40}$/i;
const TAG_NAME_PATTERN = /^(?!-)[A-Za-z0-9_./-]+$/;

function run(command, args = [], options = {}) {
    return execFileSync(command, args, {
        encoding: 'utf-8',
        stdio: options.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        cwd: options.cwd,
        env: { ...process.env, ...options.env }
    });
}

function runSilent(command, args = [], options = {}) {
    return run(command, args, { ...options, silent: true });
}

function isCommitHash(value) {
    return typeof value === 'string' && COMMIT_HASH_PATTERN.test(value);
}

function validateInputs() {
    if (!isCommitHash(COMMIT_HASH)) {
        console.error('COMMIT_HASH must be a full 40-character hexadecimal commit SHA');
        process.exit(1);
    }

    if (!TAG_NAME_PATTERN.test(TAG_NAME)) {
        console.error('TAG_NAME contains unsupported characters');
        process.exit(1);
    }
}

function remoteTagExists(tagName, cwd) {
    try {
        runSilent('git', ['ls-remote', '--exit-code', '--refs', 'origin', `refs/tags/${tagName}`], { cwd });
        return true;
    } catch (err) {
        if (err.status === 2) {
            return false;
        }

        throw err;
    }
}

function ghEnv() {
    return {
        GH_TOKEN: GITHUB_TOKEN,
        GH_HOST
    };
}

function githubReleaseExists(tagName) {
    try {
        runSilent('gh', ['release', 'view', tagName, '--repo', TARGET_REPO], { env: ghEnv() });
        return true;
    } catch (err) {
        if (err.status === 1) {
            return false;
        }

        throw err;
    }
}

function readManifest(manifestPath) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

function getPreviousReleaseCommit(manifest, currentCommitHash) {
    return manifest.history.findLast((release) => isCommitHash(release.commitHash) && release.commitHash !== currentCommitHash)?.commitHash;
}

function generateCliffNotes(prevCommit, commitHash) {
    if (!prevCommit) {
        return '_No previous managed release commit is available for changelog generation._';
    }

    const range = `${prevCommit}..${commitHash}`;
    const configPath = path.join(REPO_ROOT, 'cliff.toml');
    try {
        return runSilent('npx', ['git-cliff', range, '--config', configPath, '--workdir', NANGO_REPO_PATH, '--strip', 'all'], {
            cwd: REPO_ROOT
        }).trim();
    } catch (err) {
        const stderr = err.stderr?.toString() || err.message;
        console.warn(`git-cliff failed for range ${range}: ${stderr}`);
        return `_Changelog generation failed for ${range}. See the compare link below for changes._`;
    }
}

function buildReleaseNotes({ manifest, cliffNotes, tagName, imageVersion, appVersion }) {
    const { comparisonUrl, releaseDate } = manifest.latest;
    const releasedOn = releaseDate ? new Date(releaseDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

    const sections = [
        `## Managed Nango ${imageVersion} (application ${appVersion})`,
        '',
        `- **Released:** ${releasedOn}`,
        `- **Docker image:** \`nangohq/nango:${tagName}\``,
        `- **Pin CLI to:** \`${appVersion}\``,
        comparisonUrl ? `- **Compare:** ${comparisonUrl}` : null,
        '- **Public changelog:** https://nango.dev/docs/updates/changelog',
        '',
        '### Changes',
        '',
        cliffNotes || '_No changelog entries were generated for this release._'
    ];

    return sections.filter((line) => line !== null).join('\n');
}

function prependCustomerChangelog(changelogPath, releaseTitle, releaseNotes) {
    const header = '# Managed image releases\n\n';
    const entry = `## ${releaseTitle}\n\n${releaseNotes}\n\n`;
    const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : header;
    const normalized = existing.startsWith('#') ? existing : `${header}${existing}`;
    const releaseExists = normalized.split('\n').some((line) => line.trim() === `## ${releaseTitle}`);

    if (releaseExists) {
        console.log(`Release ${releaseTitle} already exists in CHANGELOG.md, skipping changelog update`);
        return;
    }

    const body = normalized.startsWith(header) ? normalized.slice(header.length) : normalized;
    fs.writeFileSync(changelogPath, `${header}${entry}${body.trimStart()}`);
}

function publishToCustomerRepo({ manifestPath, releaseNotes, releaseTitle, tagName }) {
    const customerManifestPath = path.join(MANAGED_RELEASES_REPO_PATH, 'managed-manifest.json');
    const customerChangelogPath = path.join(MANAGED_RELEASES_REPO_PATH, 'CHANGELOG.md');

    fs.mkdirSync(MANAGED_RELEASES_REPO_PATH, { recursive: true });
    fs.copyFileSync(manifestPath, customerManifestPath);
    prependCustomerChangelog(customerChangelogPath, releaseTitle, releaseNotes);

    const gitCwd = MANAGED_RELEASES_REPO_PATH;
    run('git', ['config', 'user.name', 'GitHub Actions'], { cwd: gitCwd });
    run('git', ['config', 'user.email', 'actions@github.com'], { cwd: gitCwd });
    run('git', ['add', 'managed-manifest.json', 'CHANGELOG.md'], { cwd: gitCwd });

    const status = runSilent('git', ['status', '--porcelain'], { cwd: gitCwd }).trim();
    if (status) {
        run('git', ['commit', '-m', `chore: publish managed release ${tagName}`], { cwd: gitCwd });
        run('git', ['push', 'origin', 'HEAD'], { cwd: gitCwd });
    } else {
        console.log('No changes to commit in managed-image-releases');
    }

    if (remoteTagExists(tagName, gitCwd)) {
        console.log(`Tag ${tagName} already exists in ${TARGET_REPO}, skipping tag creation`);
    } else {
        run('git', ['tag', '-a', tagName, '-m', `Managed release ${tagName}`], { cwd: gitCwd });
        run('git', ['push', 'origin', tagName], { cwd: gitCwd });
    }
}

function createGithubRelease({ tagName, releaseTitle, releaseNotes }) {
    if (githubReleaseExists(tagName)) {
        console.log(`Release ${tagName} already exists in ${TARGET_REPO}, skipping release creation`);
        return;
    }

    const notesFile = path.join(REPO_ROOT, '.managed-release-notes.md');
    fs.writeFileSync(notesFile, releaseNotes);

    try {
        run('gh', ['release', 'create', tagName, '--repo', TARGET_REPO, '--title', releaseTitle, '--notes-file', notesFile], {
            env: ghEnv()
        });
    } finally {
        if (fs.existsSync(notesFile)) {
            fs.unlinkSync(notesFile);
        }
    }
}

function main() {
    const missing = ['GITHUB_TOKEN', 'TAG_NAME', 'IMAGE_VERSION', 'APP_VERSION', 'COMMIT_HASH'].filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }

    validateInputs();

    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`Manifest not found at ${MANIFEST_PATH}`);
        process.exit(1);
    }

    const manifest = readManifest(MANIFEST_PATH);
    const prevCommit = getPreviousReleaseCommit(manifest, COMMIT_HASH);
    const cliffNotes = generateCliffNotes(prevCommit, COMMIT_HASH);
    const releaseNotes = buildReleaseNotes({
        manifest,
        cliffNotes,
        tagName: TAG_NAME,
        imageVersion: IMAGE_VERSION,
        appVersion: APP_VERSION
    });
    const releaseTitle = `Managed ${IMAGE_VERSION} (${APP_VERSION})`;

    if (ACT) {
        console.log('Running in act - would publish managed image release:');
        console.log(`Repository: ${TARGET_REPO}`);
        console.log(`Tag: ${TAG_NAME}`);
        console.log(`Title: ${releaseTitle}`);
        console.log('Release notes preview:');
        console.log(releaseNotes);
        return;
    }

    if (!fs.existsSync(MANAGED_RELEASES_REPO_PATH)) {
        console.error(`managed-image-releases checkout not found at ${MANAGED_RELEASES_REPO_PATH}`);
        process.exit(1);
    }

    publishToCustomerRepo({
        manifestPath: MANIFEST_PATH,
        releaseNotes,
        releaseTitle,
        tagName: TAG_NAME
    });
    createGithubRelease({ tagName: TAG_NAME, releaseTitle, releaseNotes });
    console.log(`Published managed release ${TAG_NAME} to ${TARGET_REPO}`);
}

main();
