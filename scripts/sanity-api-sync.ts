import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { createClient } from '@sanity/client';
import yaml from 'js-yaml';

import type { Provider } from '@nangohq/types';

const rateLimitSleep = 300;

if (!process.env['SANITY_TOKEN']) {
    throw new Error('Missing SANITY_TOKEN');
}
if (!process.env['SANITY_PROJECT_ID']) {
    throw new Error('Missing SANITY_PROJECT_ID');
}
if (!process.env['SANITY_DATASET']) {
    throw new Error('Missing SANITY_DATASET');
}

const dryRun = !!process.env['DRYRUN'];
const forceUpdate = process.env['FORCE_UPDATE'] === 'true';

const sanity = createClient({
    projectId: process.env['SANITY_PROJECT_ID'],
    dataset: process.env['SANITY_DATASET'],
    token: process.env['SANITY_TOKEN'],
    apiVersion: '2025-02-06',
    useCdn: false
});

const providersPath = 'packages/providers/providers.yaml';

const providers = yaml.load(await fs.readFile(providersPath, 'utf8')) as Record<string, Provider>;

const docsPaths = ['docs/integrations/all', 'docs/api-integrations'];

const neededProviders: Record<string, Provider> = {};
let hasWarnings = false;

for (const docsPath of docsPaths) {
    const files = await fs.readdir(docsPath);

    for (const file of files) {
        if (file.endsWith('.mdx')) {
            const provider = path.basename(file, '.mdx');

            if (!providers[provider]) {
                console.error(`${file}: invalid provider ${provider}`);
                hasWarnings = true;
                continue;
            }

            neededProviders[provider] = providers[provider];
        }
    }
}

console.log(`Found ${Object.keys(neededProviders).length} providers with docs`);

const sanityCategories = await sanity.fetch<{ _id: string; slug: string }[]>(`*[_type == "apiCategory"]{ _id, "slug": slug }`);
const categoriesBySlug = Object.fromEntries(sanityCategories.map((c) => [c.slug, c._id]));
console.log(`Loaded ${sanityCategories.length} Sanity categories`);

const neededCategories = Object.values(neededProviders)
    .flatMap((p) => p.categories || [])
    .filter((v, i, arr) => arr.indexOf(v) === i);

const missingCategories = neededCategories.filter((cat) => !categoriesBySlug[cat]);
if (missingCategories.length > 0) {
    console.warn(`Warning: missing Sanity categories (will be skipped): ${missingCategories.join(', ')}`);
}

const existingApis = await sanity.fetch<{ _id: string; slug: string; name: string; documentationLink: string; logo: { asset: { _ref: string } } | null }[]>(
    `*[_type == "api"]{ _id, slug, name, documentationLink, logo { asset { _ref } } }`
);
const existingBySlug = Object.fromEntries(existingApis.map((a) => [a.slug, a]));
console.log(`Found ${existingApis.length} existing Sanity API entries`);

let created = 0;
let updated = 0;
let skipped = 0;
let deleted = 0;

for (const [slug, provider] of Object.entries(neededProviders)) {
    const logoPath = `packages/webapp/public/images/template-logos/${slug}.svg`;
    const logoBuffer = await fs.readFile(logoPath).catch(() => null);

    if (!logoBuffer) {
        console.warn(`Warning: no logo found for ${slug} at ${logoPath}`);
        hasWarnings = true;
    }

    const categoryRefs = (provider.categories || [])
        .filter((cat) => categoriesBySlug[cat])
        .map((cat, i) => ({
            _key: `${cat}-${i}`,
            _type: 'reference',
            _ref: categoriesBySlug[cat]
        }));

    const existing = existingBySlug[slug];
    const docId = existing?._id ?? `provider-${slug}`;

    // upload logo to Sanity CDN — source.id deduplicates so re-runs are no-ops
    let logoAssetRef: string | undefined;
    if (logoBuffer) {
        if (!dryRun) {
            const asset = await sanity.assets.upload('image', logoBuffer, {
                filename: `${slug}.svg`,
                contentType: 'image/svg+xml',
                source: { id: slug, name: slug }
            });
            logoAssetRef = asset._id;
        } else {
            logoAssetRef = existing?.logo?.asset?._ref;
        }
    }

    const logoRef = logoAssetRef ?? existing?.logo?.asset?._ref;

    const document = {
        _type: 'api' as const,
        _id: docId,
        name: provider.display_name,
        slug,
        ...(logoRef ? { logo: { _type: 'image', asset: { _type: 'reference', _ref: logoRef } } } : {}),
        documentationLink: provider.docs,
        category: categoryRefs
    };

    if (!forceUpdate && existing) {
        const unchanged =
            existing.name === document.name && existing.documentationLink === document.documentationLink && existing.logo?.asset?._ref === logoRef;

        if (unchanged) {
            skipped++;
            continue;
        }
    }

    if (!dryRun) {
        await sanity.createOrReplace(document);
        await setTimeout(rateLimitSleep);
    }

    if (existing) {
        console.log(`Updated ${slug}${dryRun ? ' (dry run)' : ''}`);
        updated++;
    } else {
        console.log(`Created ${slug}${dryRun ? ' (dry run)' : ''}`);
        created++;
    }
}

const seenSlugs = new Set(Object.keys(neededProviders));
for (const api of existingApis) {
    if (seenSlugs.has(api.slug)) {
        continue;
    }

    if (!dryRun) {
        await sanity.delete(api._id);
        await setTimeout(rateLimitSleep);
    }

    console.log(`Deleted ${api.slug}${dryRun ? ' (dry run)' : ''}`);
    deleted++;
}

console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped, ${deleted} deleted${dryRun ? ' (dry run)' : ''}`);

if (hasWarnings) {
    process.exit(1);
}
