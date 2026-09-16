import fs from 'node:fs/promises';

import { createClient } from '@sanity/client';

import type { FlowsZeroJson, ScriptTypeLiteral } from '@nangohq/types';

const apiVersion = '2025-02-06';

interface SanityTemplateDoc {
    _type: 'apiTemplate';
    _id: string;
    api: { _type: 'reference'; _ref: string };
    name: string;
    description: string | undefined;
    type: ScriptTypeLiteral;
    documentationLink: string | undefined;
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
const projectId = process.env['SANITY_PROJECT_ID'];
const dataset = process.env['SANITY_DATASET'];
const token = process.env['SANITY_TOKEN'];

console.log(`Config: dryRun=${dryRun}`);

const sanity = createClient({ projectId, dataset, token, apiVersion, useCdn: false });

const flowsPath = 'packages/shared/flows.zero.json';

const flows = JSON.parse(await fs.readFile(flowsPath, 'utf8')) as FlowsZeroJson;

const existingApiSlugs = new Set((await sanity.fetch<{ slug: string }[]>(`*[_type == "api"]{ slug }`)).map((doc) => doc.slug));
console.log(`Found ${existingApiSlugs.size} existing Sanity api docs`);

interface TemplateEntry {
    providerConfigKey: string;
    type: ScriptTypeLiteral;
    name: string;
    description: string | undefined;
    sourceFolder: string;
}

const entriesByProvider = new Map<string, FlowsZeroJson>();
for (const flow of flows) {
    const existing = entriesByProvider.get(flow.providerConfigKey);
    if (existing) {
        existing.push(flow);
    } else {
        entriesByProvider.set(flow.providerConfigKey, [flow]);
    }
}

const templates: TemplateEntry[] = [];
for (const [providerConfigKey, blocks] of entriesByProvider) {
    if (!existingApiSlugs.has(providerConfigKey)) {
        console.warn(`Skipping ${providerConfigKey}: no matching Sanity api doc (no docs page yet?)`);
        continue;
    }

    if (blocks.length > 1) {
        console.warn(`${providerConfigKey} has ${blocks.length} entries in flows.zero.json (expected 1), merging deterministically`);
    }
    const sorted = [...blocks].sort((a, b) => Number(!!a.symLinkTargetName) - Number(!!b.symLinkTargetName));

    const seen = new Map<string, TemplateEntry>();
    for (const block of sorted) {
        const sourceFolder = block.symLinkTargetName || providerConfigKey;
        for (const item of [...block.syncs, ...block.actions]) {
            const key = `${item.type}:${item.name}`;
            if (seen.has(key)) {
                console.warn(`  duplicate ${item.type} "${item.name}" — keeping the one from the non-symlinked entry`);
                continue;
            }
            seen.set(key, { providerConfigKey, type: item.type, name: item.name, description: item.description, sourceFolder });
        }
    }

    templates.push(...seen.values());
}

console.log(`Found ${templates.length} templates across ${entriesByProvider.size} providers`);

function buildDocsUrl(sourceFolder: string, type: ScriptTypeLiteral, name: string): string {
    return `https://github.com/NangoHQ/integration-templates/blob/main/integrations/${sourceFolder}/${type}s/${name}.ts`;
}

function buildDocument(template: TemplateEntry): SanityTemplateDoc {
    const docId = `template-${template.providerConfigKey}-${template.type}-${template.name}`;

    return {
        _type: 'apiTemplate' as const,
        _id: docId,
        api: { _type: 'reference' as const, _ref: `provider-${template.providerConfigKey}` },
        name: template.name,
        description: template.description,
        type: template.type,
        documentationLink: buildDocsUrl(template.sourceFolder, template.type, template.name)
    };
}

type ExistingTemplate = Pick<SanityTemplateDoc, '_id' | 'name' | 'description' | 'type' | 'documentationLink'> & { api: { _ref: string } | null };

const existingTemplates = await sanity.fetch<ExistingTemplate[]>(
    `*[_type == "apiTemplate" && !(_id in path("drafts.**"))]{ _id, name, description, type, documentationLink, api { _ref } }`
);
console.log(`Found ${existingTemplates.length} existing Sanity template entries`);
const existingById = new Map(existingTemplates.map((doc) => [doc._id, doc]));

let created = 0;
let updated = 0;
let skipped = 0;
let deleted = 0;

const documents = templates.map(buildDocument);
const seenIds = new Set(documents.map((doc) => doc._id));

const toUpsert = documents.filter((doc) => {
    const existing = existingById.get(doc._id);
    if (!existing) {
        created++;
        return true;
    }

    const unchanged =
        existing.name === doc.name &&
        existing.description === doc.description &&
        existing.type === doc.type &&
        existing.documentationLink === doc.documentationLink &&
        existing.api?._ref === doc.api._ref;

    if (unchanged) {
        skipped++;
        return false;
    }

    updated++;
    return true;
});

const toDelete = existingTemplates.filter((doc) => !seenIds.has(doc._id));
deleted = toDelete.length;

if (dryRun) {
    for (const doc of toUpsert) {
        console.log(`${existingById.has(doc._id) ? 'Updated' : 'Created'} ${doc._id} (dry run)`);
    }
    for (const doc of toDelete) {
        console.log(`Deleted ${doc._id} (dry run)`);
    }
} else if (toUpsert.length > 0 || toDelete.length > 0) {
    const tx = sanity.transaction();
    for (const doc of toUpsert) {
        tx.createOrReplace(doc);
    }
    for (const doc of toDelete) {
        tx.delete(doc._id);
    }
    await tx.commit();
    console.log(`Batch committed ${toUpsert.length} upsert(s), ${toDelete.length} delete(s)`);
}

console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped, ${deleted} deleted${dryRun ? ' (dry run)' : ''}`);
