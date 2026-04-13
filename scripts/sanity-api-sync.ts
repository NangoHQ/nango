import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { createClient } from '@sanity/client';
import yaml from 'js-yaml';

import type { Provider } from '@nangohq/types';

const rateLimitSleep = 300;
const apiVersion = '2025-02-06';

interface SanityDoc {
    _type: 'api';
    _id: string;
    name: string | undefined;
    slug: string;
    logo?: { _type: 'image'; asset: { _type: 'reference'; _ref: string } };
    documentationLink: string | undefined;
    category: { _key: string; _type: string; _ref: string }[];
}

if (!process.env['SANITY_TOKEN']) {
    throw new Error('Missing SANITY_TOKEN');
}
if (!process.env['SANITY_PROJECT_ID']) {
    throw new Error('Missing SANITY_PROJECT_ID');
}
if (!process.env['SANITY_DATASET']) {
    throw new Error('Missing SANITY_DATASET');
}

const dryRun = process.env['DRYRUN'] === 'true';
const forceUpdate = process.env['FORCE_UPDATE'] === 'true';
const projectId = process.env['SANITY_PROJECT_ID'];
const dataset = process.env['SANITY_DATASET'];
const token = process.env['SANITY_TOKEN'];

console.log(`Config: dryRun=${dryRun}, forceUpdate=${forceUpdate}`);

const sanity = createClient({ projectId, dataset, token, apiVersion, useCdn: false });

const providersPath = 'packages/providers/providers.yaml';

const providers = yaml.load(await fs.readFile(providersPath, 'utf8')) as Record<string, Provider>;

const docsPaths = ['docs/integrations/all', 'docs/api-integrations'];

const neededProviders: Record<string, Provider> = {};
let hasWarnings = false;

// collect all mdx filenames that map to a known provider slug
const availableDocSlugs = new Set<string>();
for (const docsPath of docsPaths) {
    const files = await fs.readdir(docsPath);

    for (const file of files) {
        if (file.endsWith('.mdx')) {
            const slug = path.basename(file, '.mdx');

            if (!providers[slug]) {
                console.error(`${file}: invalid provider ${slug}`);
                hasWarnings = true;
                continue;
            }

            availableDocSlugs.add(slug);
        }
    }
}

// include providers that have their own MDX file or reference an existing one via their docs URL
for (const [slug, provider] of Object.entries(providers)) {
    const docsFilename = provider.docs?.split('/').slice(-1)[0];
    if (availableDocSlugs.has(slug) || (docsFilename && availableDocSlugs.has(docsFilename))) {
        neededProviders[slug] = provider;
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
    hasWarnings = true;
}

const existingApis = await sanity.fetch<
    { _id: string; slug: string; name: string; documentationLink: string; logo: { asset: { _ref: string } } | null; category: { _ref: string }[] | null }[]
>(`*[_type == "api" && !(_id in path("drafts.**"))]{ _id, slug, name, documentationLink, logo { asset { _ref } }, category[] { _ref } }`);
const existingBySlug = Object.fromEntries(existingApis.map((a) => [a.slug, a]));
console.log(`Found ${existingApis.length} existing Sanity API entries`);

async function buildDocument(slug: string, provider: Provider): Promise<SanityDoc> {
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
            _ref: categoriesBySlug[cat]!
        }));

    const existing = existingBySlug[slug];
    const docId = existing?._id ?? `provider-${slug}`;

    let logoAssetRef: string | undefined;
    if (logoBuffer) {
        if (!dryRun) {
            console.log(`Uploading logo for ${slug}...`);
            const asset = await sanity.assets.upload('image', logoBuffer, {
                filename: `${slug}.svg`,
                contentType: 'image/svg+xml',
                source: { id: slug, name: slug }
            });
            logoAssetRef = asset._id;
            console.log(`Uploaded logo for ${slug}: ${logoAssetRef}`);
        } else {
            logoAssetRef = existing?.logo?.asset?._ref;
        }
    }

    const logoRef = logoAssetRef ?? existing?.logo?.asset?._ref;

    return {
        _type: 'api' as const,
        _id: docId,
        name: provider.display_name,
        slug,
        ...(logoRef ? { logo: { _type: 'image' as const, asset: { _type: 'reference' as const, _ref: logoRef } } } : {}),
        documentationLink: provider.docs,
        category: categoryRefs
    };
}

let created = 0;
let updated = 0;
let skipped = 0;
let deleted = 0;

if (forceUpdate) {
    const documents: SanityDoc[] = [];

    for (const [slug, provider] of Object.entries(neededProviders)) {
        console.log(`Processing ${slug}...`);
        const doc = await buildDocument(slug, provider);
        documents.push(doc);

        if (existingBySlug[slug]) {
            updated++;
        } else {
            created++;
        }
    }

    const seenSlugs = new Set(Object.keys(neededProviders));
    const toDelete = existingApis.filter((api) => !seenSlugs.has(api.slug));
    deleted = toDelete.length;

    if (!dryRun) {
        const tx = sanity.transaction();
        for (const doc of documents) {
            tx.createOrReplace(doc);
        }
        for (const api of toDelete) {
            tx.delete(api._id);
        }
        await tx.commit();
        console.log(`Batch committed ${documents.length} upsert(s), ${toDelete.length} delete(s)`);
    } else {
        for (const doc of documents) {
            console.log(`${existingBySlug[doc.slug] ? 'Updated' : 'Created'} ${doc.slug} (dry run)`);
        }
        for (const api of toDelete) {
            console.log(`Deleted ${api.slug} (dry run)`);
        }
    }
} else {
    for (const [slug, provider] of Object.entries(neededProviders)) {
        const existing = existingBySlug[slug];

        if (existing) {
            const newCategoryRefs = new Set((provider.categories || []).filter((cat) => categoriesBySlug[cat]).map((cat) => categoriesBySlug[cat]!));
            const existingCategoryRefs = new Set((existing.category || []).map((c: { _ref: string }) => c._ref));
            const categoriesUnchanged =
                existingCategoryRefs.size === newCategoryRefs.size && [...newCategoryRefs].every((ref) => existingCategoryRefs.has(ref));

            const unchanged = existing.name === provider.display_name && existing.documentationLink === provider.docs && categoriesUnchanged;

            if (unchanged) {
                skipped++;
                continue;
            }
        }

        const doc = await buildDocument(slug, provider);

        if (!dryRun) {
            await sanity.createOrReplace(doc);
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
}

console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped, ${deleted} deleted${dryRun ? ' (dry run)' : ''}`);

if (hasWarnings) {
    process.exit(1);
}
