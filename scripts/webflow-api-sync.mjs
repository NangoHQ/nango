import fs from 'node:fs/promises';
import path from 'node:path';
import { WebflowClient } from 'webflow-api';
import yaml from 'js-yaml';
import { setTimeout } from 'node:timers/promises';
import util from 'node:util';

const rateLimitSleep = 1000;

const apiCollectionId = '66f2c79a523a1055b3da7339';
const apiCategoriesId = '6751672fcfb952c066685384';
const siteId = '63c092e946f9b71ff6874169';

const domainIds = ['63d392e62ba46692fb9e082e', '63d392e62ba4666ba69e082d'];

if (!process.env.WEBFLOW_CMS_API_TOKEN) {
    throw new Error('Missing WEBFLOW_CMS_API_TOKEN');
}

const webflow = new WebflowClient({ accessToken: process.env.WEBFLOW_CMS_API_TOKEN });

const providersPath = 'packages/shared/providers.yaml';
const providers = yaml.load(await fs.readFile(providersPath, 'utf8'));

const docsPath = 'docs-v2/integrations/all';
const files = await fs.readdir(docsPath);

// we only need a subset of providers based on how our docs are written
const neededProviders = {};

for (const file of files) {
    if (file.endsWith('.mdx')) {
        const filePath = path.join(docsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        let lines = content.split('\n');

        // find the integration line
        const providerLine = lines.find((line) => line.startsWith('provider: '));
        if (!providerLine) {
            throw new Error(`Unable to find provider entry in ${file}`);
        }
        const provider = providerLine.split('provider: ')[1].trim();
        neededProviders[provider] = { ...providers[provider], url: `https://docs.nango.dev/integrations/all/${path.basename(file, '.mdx')}` };
    }
}

let categoryResp;
let categoryOffset = 0;
let categories = [];
do {
    categoryResp = await webflow.collections.items.listItems(apiCategoriesId, { offset: categoryOffset });

    categories = categories.concat(categoryResp.items);
    categoryOffset += categoryResp.items.length;

    // rate limit
    await setTimeout(rateLimitSleep);
} while (categoryOffset < categoryResp.pagination.total);

const categoriesBySlug = categories.reduce((acc, item) => {
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

let apiResp;
let apiOffset = 0;
let apiItems = [];
do {
    apiResp = await webflow.collections.items.listItems(apiCollectionId, { offset: apiOffset });

    apiItems = apiItems.concat(apiResp.items);
    apiOffset += apiResp.items.length;

    // rate limit
    await setTimeout(rateLimitSleep);
} while (apiOffset < apiResp.pagination.total);

const apiItemsBySlug = apiItems.reduce((acc, item) => {
    acc[item.fieldData.slug] = item;

    return acc;
}, {});

const seen = [];
for (const [slug, provider] of Object.entries(neededProviders)) {
    seen.push(slug);

    if (apiItemsBySlug[slug]) {
        const item = apiItemsBySlug[slug];

        const previous = {
            fieldData: {
                name: item.fieldData.name,
                documentation: item.fieldData.documentation,
                'api-categories': item.fieldData['api-categories']
            }
        };

        const update = {
            fieldData: {
                name: provider.display_name,
                documentation: provider.url,
                'api-categories': (provider.categories || []).map((category) => categoriesBySlug[category].id)
            }
        };

        if (!util.isDeepStrictEqual(previous, update)) {
            try {
                await webflow.collections.items.updateItem(apiCollectionId, item.id, update);
                console.log(`Updated ${slug}`);
                await setTimeout(rateLimitSleep);
            } catch (e) {
                console.error(`Failed to update ${slug}`, e);
                process.exit(1);
            }
        }
    } else {
        try {
            await webflow.collections.items.createItem(apiCollectionId, {
                fieldData: {
                    name: provider.display_name,
                    slug: slug,
                    documentation: provider.url,
                    logo: `https://app.nango.dev/images/template-logos/${slug}.svg`,
                    'api-categories': (provider.categories || []).map((category) => categoriesBySlug[category].id)
                }
            });
            console.log(`Created ${slug}`);
            await setTimeout(rateLimitSleep);
        } catch (e) {
            console.error(`Failed to update ${slug}`, e);
            process.exit(1);
        }
    }
}

const needDeletion = Object.keys(apiItemsBySlug).filter((slug) => !seen.includes(slug));
for (const toDelete of needDeletion) {
    try {
        await webflow.collections.items.deleteItem(apiCollectionId, apiItemsBySlug[toDelete].id);
        console.log(`Deleted ${toDelete}`);
        await setTimeout(rateLimitSleep);
    } catch (e) {
        console.error(`Failed to delete ${toDelete}`, e);
        process.exit(1);
    }
}

await webflow.sites.publish(siteId, { customDomains: domainIds });
