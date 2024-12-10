import fs from 'node:fs/promises';
import { WebflowClient } from 'webflow-api';
import yaml from 'js-yaml';
import { setTimeout } from 'node:timers/promises';

const apiCollectionId = '66f2c79a523a1055b3da7339';
const siteId = '63c092e946f9b71ff6874169';

const domainIds = ['63d392e62ba46692fb9e082e', '63d392e62ba4666ba69e082d'];

if (!process.env.WEBFLOW_CMS_API_TOKEN) {
    throw new Error('Missing WEBFLOW_CMS_API_TOKEN');
}

const providersPath = 'packages/shared/providers.yaml';
const providers = yaml.load(await fs.readFile(providersPath, 'utf8'));

const webflow = new WebflowClient({ accessToken: process.env.WEBFLOW_CMS_API_TOKEN });

// let resp;
// let offset = 0;
// let items = [];
// do {
//     resp = await webflow.collections.items.listItems(apiCollectionId, { offset });

//     items = items.concat(resp.items);
//     offset += resp.items.length;

//     // rate limit
//     await setTimeout(1000);
// } while (offset < resp.pagination.total);

// const itemsBySlug = resp.items.reduce((acc, item) => {
//     acc[item.fieldData.slug] = item;

//     return acc;
// }, {});

// const seen = [];
// for (const [slug, provider] of Object.entries(providers)) {
//     seen.push(slug);

//     if (itemsBySlug[slug]) {
//         console.log(`${slug} already exists`);
//     } else {
//         await webflow.collections.items.createItem(apiCollectionId, {
//             fieldData: {
//                 name: provider.display_name,
//                 slug: slug,
//                 documentation: provider.docs,
//                 logo: `https://app.nango.dev/images/template-logos/${slug}.svg`,
//                 'api-categories': []
//             }
//         });
//     }
// }

// const needDeletion = Object.keys(itemsBySlug).filter((slug) => !seen.includes(slug));
// console.log('DELETE', needDeletion);

await webflow.sites.publish(siteId, { customDomains: domainIds });
