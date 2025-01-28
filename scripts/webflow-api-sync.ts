import fs from 'node:fs/promises';
import path from 'node:path';
import { WebflowClient } from 'webflow-api';
import yaml from 'js-yaml';
import { setTimeout } from 'node:timers/promises';
import util from 'node:util';
import type { CollectionItem, CollectionItemList } from 'webflow-api/api';
import type { Provider } from '@nangohq/types';

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

const docsPath = 'docs-v2/integrations/all';
const files = await fs.readdir(docsPath);

// we only need a subset of providers based on how our docs are written
const neededProviders: Record<string, Provider> = {};

const providerLineRegex = /^provider: ([^\s]+)\s*$/m;

let hasWarnings = false;
for (const file of files) {
    if (file.endsWith('.mdx')) {
        const filePath = path.join(docsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');

        const providerMatch = content.match(providerLineRegex);
        if (!providerMatch?.[1]) {
            // eslint-disable-next-line no-console
            console.warn(`No provider line found in ${file}`);
            hasWarnings = true;
            continue;
        }
        const provider = providerMatch[1];

        if (!providers[provider]) {
            // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
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
    acc[item.fieldData.slug] = item;

    return acc;
}, {});

const seen: string[] = [];
for (const [slug, provider] of Object.entries(neededProviders)) {
    seen.push(slug);

    if (apiItemsBySlug[slug]) {
        const item = apiItemsBySlug[slug];
        if (!item.id) {
            throw new Error(`Missing item id for ${slug}`);
        }

        const previous = {
            fieldData: {
                name: item.fieldData.name,
                documentation: item.fieldData['documentation'],
                'api-categories': item.fieldData['api-categories']
            }
        };

        const providerCategories: string[] = provider.categories || [];
        const apiCategories = providerCategories.map((category) => categoriesBySlug[category]?.id);

        const update = {
            fieldData: {
                name: provider.display_name,
                documentation: provider.docs,
                'api-categories': apiCategories
            }
        };

        if (!util.isDeepStrictEqual(previous, update)) {
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
                        logo: `https://raw.githubusercontent.com/NangoHQ/nango/refs/heads/master/packages/webapp/public/images/template-logos/${slug}.svg`,
                        'api-categories': providerCategories.map((category) => categoriesBySlug[category]?.id)
                    }
                });
            }
            console.log(`Created ${slug} ${dryRun ? '(dry run)' : ''}`);
            await setTimeout(rateLimitSleep);
        } catch (err) {
            console.error(`Failed to update ${slug}`, err);
            process.exit(1);
        }
    }
}

const needDeletion = Object.keys(apiItemsBySlug).filter((slug) => !seen.includes(slug));
for (const toDelete of needDeletion) {
    try {
        if (!apiItemsBySlug[toDelete]?.id) {
            throw new Error('Unexpected missing item id');
        }

        if (!dryRun) {
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
