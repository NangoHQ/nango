import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import util from 'node:util';

import yaml from 'js-yaml';
import { WebflowClient } from 'webflow-api';

import flowsJson from '../packages/shared/flows.zero.json' with { type: 'json' };

import type { FlowZeroJson, Provider } from '@nangohq/types';
import type { CollectionItem, CollectionItemList } from 'webflow-api/api';

const rateLimitSleep = 1000;

const apiCollectionId = '66f2c79a523a1055b3da7339';
const apiCategoriesId = '6751672fcfb952c066685384';
const siteId = '63c092e946f9b71ff6874169';
const domainIds = ['63d392e62ba46692fb9e082e', '63d392e62ba4666ba69e082d'];

if (!process.env['WEBFLOW_CMS_API_TOKEN']) {
    throw new Error('Missing WEBFLOW_CMS_API_TOKEN');
}

let dryRun = false;
if (process.env['DRYRUN']) {
    dryRun = true;
}

const webflow = new WebflowClient({ accessToken: process.env['WEBFLOW_CMS_API_TOKEN'] });

const providersPath = 'packages/providers/providers.yaml';
// eslint-disable-next-line import/no-named-as-default-member
const providers = yaml.load(await fs.readFile(providersPath, 'utf8')) as Record<string, Provider>;

const docsPaths = ['docs/integrations/all', 'docs/api-integrations'];
const files: string[] = [];
for (const docsPath of docsPaths) {
    const dirFiles = await fs.readdir(docsPath);
    files.push(...dirFiles);
}

// we only need a subset of providers based on how our docs are written
const neededProviders: Record<string, Provider> = {};

let hasWarnings = false;
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

let categoryResp: CollectionItemList;
let categoryOffset = 0;
let categories: CollectionItem[] = [];
do {
    categoryResp = await webflow.collections.items.listItems(apiCategoriesId, { offset: categoryOffset });

    if (categoryResp.items) {
        categories = categories.concat(categoryResp.items);
        categoryOffset += categoryResp.items.length;
    }

    // rate limit
    await setTimeout(rateLimitSleep);
} while (categoryResp.pagination?.total && categoryOffset < categoryResp.pagination.total);

const categoriesBySlug = categories.reduce<Record<string, CollectionItem>>((acc, item) => {
    acc[item.fieldData.slug] = item;
    return acc;
}, {});

const neededCategories = Object.values(neededProviders)
    .flatMap((provider) => provider.categories || [])
    .filter((value, index, arr) => arr.indexOf(value) === index);

const missingCategories = neededCategories.filter((category) => !categoriesBySlug[category]);
if (missingCategories.length > 0) {
    console.error(`Missing categories: ${missingCategories.join(', ')}`);
    process.exit(1);
}

let apiResp: CollectionItemList;
let apiOffset = 0;
let apiItems: CollectionItem[] = [];
do {
    apiResp = await webflow.collections.items.listItems(apiCollectionId, { offset: apiOffset });

    if (apiResp.items) {
        apiItems = apiItems.concat(apiResp.items);
        apiOffset += apiResp.items.length;
    }

    // rate limit
    await setTimeout(rateLimitSleep);
} while (apiResp.pagination?.total && apiOffset < apiResp.pagination.total);

const apiItemsBySlug = apiItems.reduce<Record<string, CollectionItem>>((acc, item) => {
    if (!item.fieldData.slug) {
        console.warn(`Warning: API item "${item.fieldData.name}" (id: ${item.id}) has no slug`);
        return acc;
    }
    acc[item.fieldData.slug] = item;

    return acc;
}, {});

const seen: string[] = [];
const flowProviderKeys = flowsJson.map((flow: FlowZeroJson) => flow.providerConfigKey);

for (const [slug, provider] of Object.entries(neededProviders)) {
    seen.push(slug);

    const fullLogoPath = await fs.realpath(path.join('packages', 'webapp', 'public', 'images', 'template-logos', `${slug}.svg`));
    const logoPath = path.relative(process.cwd(), fullLogoPath);
    const logo = `https://raw.githubusercontent.com/NangoHQ/nango/refs/heads/master/${logoPath}`;

    let preBuiltCount = 0;
    const flowProviderIndex = flowProviderKeys.indexOf(slug);
    if (flowProviderIndex !== -1) {
        if (flowsJson[flowProviderIndex]['actions']) {
            preBuiltCount += flowsJson[flowProviderIndex]['actions'].length;
        }

        if (flowsJson[flowProviderIndex]['syncs']) {
            preBuiltCount += flowsJson[flowProviderIndex]['syncs'].length;
        }
    }

    if (apiItemsBySlug[slug]) {
        const item = apiItemsBySlug[slug];
        if (!item?.id) {
            throw new Error(`Missing item id for ${slug}`);
        }

        const previous = {
            fieldData: {
                name: item.fieldData.name,
                documentation: item.fieldData['documentation'],
                'api-categories': item.fieldData['api-categories'],
                'pre-built-integrations-count': item.fieldData['pre-built-integrations-count']
            }
        };

        const providerCategories: string[] = provider.categories || [];
        const apiCategories = providerCategories.map((category) => categoriesBySlug[category]?.id);

        const update = {
            fieldData: {
                name: provider.display_name,
                documentation: provider.docs,
                'api-categories': apiCategories,
                'pre-built-integrations-count': preBuiltCount
            }
        };

        if (!util.isDeepStrictEqual(previous, update)) {
            // always update logo, just in case
            (update.fieldData as any).logo = logo;

            try {
                if (!dryRun) {
                    await webflow.collections.items.updateItem(apiCollectionId, item.id, update);
                }

                console.log(`Updated ${slug} ${dryRun ? '(dry run)' : ''}`);
                await setTimeout(rateLimitSleep);
            } catch (err) {
                console.error(`Failed to update ${slug}`, err);
                process.exit(1);
            }
        }
    } else {
        try {
            const providerCategories: string[] = provider.categories || [];

            if (!dryRun) {
                await webflow.collections.items.createItem(apiCollectionId, {
                    fieldData: {
                        name: provider.display_name,
                        slug: slug,
                        documentation: provider.docs,
                        logo,
                        'api-categories': providerCategories.map((category) => categoriesBySlug[category]?.id),
                        'pre-built-integrations-count': preBuiltCount
                    }
                });
            }
            console.log(`Created ${slug} ${dryRun ? '(dry run)' : ''}`);
            await setTimeout(rateLimitSleep);
        } catch (err: any) {
            // Handle the case where the item exists but wasn't found in our initial fetch
            if (
                err?.statusCode === 400 &&
                err?.body?.details?.some((d: any) => d.param === 'slug' && d.description?.includes('Unique value is already in database'))
            ) {
                console.warn(`Warning: Item with slug "${slug}" already exists in Webflow but wasn't in apiItemsBySlug map`);

                // First check if it's in our originally fetched items but with a different slug or missing slug
                const foundInOriginal = apiItems.find((item) => item.fieldData.slug === slug);

                if (foundInOriginal?.id) {
                    console.log(`Found ${slug} in original fetch (was not properly indexed). Updating...`);
                    const apiCategories = providerCategories.map((category) => categoriesBySlug[category]?.id);
                    const update = {
                        fieldData: {
                            name: provider.display_name,
                            documentation: provider.docs,
                            logo,
                            'api-categories': apiCategories,
                            'pre-built-integrations-count': preBuiltCount
                        }
                    };

                    if (!dryRun) {
                        await webflow.collections.items.updateItem(apiCollectionId, foundInOriginal.id, update);
                    }
                    console.log(`Updated ${slug} ${dryRun ? '(dry run)' : ''}`);
                    await setTimeout(rateLimitSleep);
                } else {
                    // Item truly wasn't in our fetch - this could be a race condition or pagination issue
                    console.error(`Error: Item "${slug}" exists in Webflow but was not found in our fetch of ${apiItems.length} items`);
                    console.error(`This may indicate a pagination issue or race condition. Please re-run the script.`);
                    throw err;
                }
            } else {
                console.error(`Failed to create ${slug}`, err);
                process.exit(1);
            }
        }
    }
}

const needDeletion = Object.keys(apiItemsBySlug).filter((slug) => !seen.includes(slug));
for (const toDelete of needDeletion) {
    try {
        if (!apiItemsBySlug[toDelete]?.id) {
            throw new Error('Unexpected missing item id');
        }

        if (!dryRun && apiItemsBySlug[toDelete]) {
            await webflow.collections.items.deleteItem(apiCollectionId, apiItemsBySlug[toDelete].id);
        }

        console.log(`Deleted ${toDelete} ${dryRun ? '(dry run)' : ''}`);
        await setTimeout(rateLimitSleep);
    } catch (err) {
        console.error(`Failed to delete ${toDelete}`, err);
        process.exit(1);
    }
}

if (!dryRun) {
    await webflow.sites.publish(siteId, { customDomains: domainIds });
}

if (hasWarnings) {
    process.exit(1);
}
