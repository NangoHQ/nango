import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import yaml from 'js-yaml';

const docsRoot = 'docs';
const docsJsonPath = path.join(docsRoot, 'docs.json');
const providersPath = 'packages/providers/providers.yaml';
const baseUrl = 'https://nango.dev/docs';

type NavItem = string | NavGroup;

interface NavGroup {
    group?: string;
    tab?: string;
    pages?: NavItem[];
    groups?: NavGroup[];
    href?: string;
}

interface DocsJson {
    name?: string;
    navigation?: {
        tabs?: NavGroup[];
    };
}

interface Frontmatter {
    title?: string;
    sidebarTitle?: string;
    description?: string;
}

interface ProviderConfig {
    display_name?: string;
    auth_mode?: string;
    docs?: string;
    docs_connect?: string;
    setup_guide_url?: string;
    categories?: string[];
    alias?: string;
}

interface ProviderCatalogConfig {
    provider?: ProviderConfig;
    inheritedProvider?: ProviderConfig;
}

interface PageMeta {
    route: string;
    title: string;
    description?: string;
    filePath: string;
}

interface CatalogEntry {
    slug: string;
    title: string;
    authMode: string;
    route: string;
    connectRoute: string;
    setupRoute: string;
    categories: string;
}

const docsJson = JSON.parse(await fs.readFile(docsJsonPath, 'utf-8')) as DocsJson;
const providers = yaml.load(await fs.readFile(providersPath, 'utf-8')) as Record<string, ProviderConfig>;

const tabs = docsJson.navigation?.tabs ?? [];
const documentationTab = tabs.find((tab) => tab.tab === 'Documentation');
const integrationsTab = tabs.find((tab) => tab.tab === 'APIs & Integrations');
const changelogTab = tabs.find((tab) => tab.tab === 'Changelog');

if (!documentationTab || !integrationsTab) {
    throw new Error('Expected Documentation and APIs & Integrations tabs in docs/docs.json');
}

const apiOverviewGroup = integrationsTab.groups?.find((group) => group.group === 'Overview');
const apiCatalogGroup = integrationsTab.groups?.find(isApiCatalogGroup);

if (!apiOverviewGroup || !apiCatalogGroup) {
    throw new Error('Expected Overview and APIs & Integrations catalog groups in docs/docs.json');
}

const documentationPages = collectPages(documentationTab);
const apiOverviewPages = collectPages(apiOverviewGroup);
const changelogPages = changelogTab ? collectPages(changelogTab) : [];
const apiCatalogRoutes = collectPages(apiCatalogGroup);

const llmsPages = unique([...documentationPages, ...apiOverviewPages]);
const catalogEntries = await buildCatalog(apiCatalogRoutes);

await fs.writeFile(path.join(docsRoot, 'api-catalog.txt'), renderApiCatalog(catalogEntries), 'utf-8');
await fs.writeFile(path.join(docsRoot, 'llms.txt'), await renderLlmsTxt(documentationTab, apiOverviewGroup, changelogPages, catalogEntries), 'utf-8');
await fs.writeFile(path.join(docsRoot, 'llms-full.txt'), await renderLlmsFullTxt(llmsPages, catalogEntries), 'utf-8');

console.log(`Generated docs/llms.txt, docs/llms-full.txt, and docs/api-catalog.txt`);

function collectPages(node: NavItem | NavGroup | undefined): string[] {
    if (!node) {
        return [];
    }

    if (typeof node === 'string') {
        return [node];
    }

    return [...(node.pages ?? []).flatMap((item) => collectPages(item)), ...(node.groups ?? []).flatMap((group) => collectPages(group))];
}

function isApiCatalogGroup(group: NavGroup): boolean {
    return /(?:\d+\+\s+)?APIs & Integrations$/.test(group.group ?? '') && collectPages(group).some((route) => isProviderRoute(route));
}

async function renderLlmsTxt(documentation: NavGroup, apiOverview: NavGroup, changelogRoutes: string[], catalog: CatalogEntry[]): Promise<string> {
    const lines = [
        '# Nango Docs',
        '',
        '> Nango is the integration layer for AI-built, code-owned product integrations. These files are curated for agents: core docs are listed directly, while provider-specific API pages live in a compact catalog.',
        '',
        `Full core-docs context: ${baseUrl}/llms-full.txt`,
        `API and integration catalog: ${baseUrl}/api-catalog.txt`,
        '',
        'Use provider URLs by replacing `{slug}` with a slug from the API catalog:',
        `- Main provider page: ${baseUrl}/integrations/all/{slug}.md or ${baseUrl}/api-integrations/{slug}.md`,
        `- Connect guide when available: ${baseUrl}/integrations/all/{slug}/connect.md or ${baseUrl}/api-integrations/{slug}/connect.md`,
        ''
    ];

    for (const group of documentation.groups ?? []) {
        lines.push(`## ${group.group}`, '');
        lines.push(...(await renderNavBullets(group)));
        lines.push('');
    }

    lines.push(`## ${apiOverview.group}`, '');
    lines.push(...(await renderNavBullets(apiOverview)));
    lines.push('');

    lines.push('## APIs and integrations', '');
    lines.push(
        `- [API catalog](${baseUrl}/api-catalog.txt): ${catalog.length} provider slugs with canonical docs routes, auth modes, setup guides, and connect guides.`
    );
    lines.push('- Provider-specific pages are intentionally not expanded here so core Nango guides remain easy for agents to find.');
    lines.push('');

    if (changelogRoutes.length > 0) {
        lines.push('## Optional', '');
        for (const route of changelogRoutes) {
            const meta = await readPageMeta(route);
            lines.push(renderLink(meta));
        }
        lines.push('');
    }

    return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

async function renderNavBullets(group: NavGroup, prefix = ''): Promise<string[]> {
    const lines: string[] = [];

    for (const item of group.pages ?? []) {
        if (typeof item === 'string') {
            const meta = await readPageMeta(item);
            lines.push(renderLink(meta, prefix));
            continue;
        }

        const nextPrefix = item.group ? `${prefix}${item.group}: ` : prefix;
        lines.push(...(await renderNavBullets(item, nextPrefix)));
    }

    for (const nestedGroup of group.groups ?? []) {
        const nextPrefix = nestedGroup.group ? `${prefix}${nestedGroup.group}: ` : prefix;
        lines.push(...(await renderNavBullets(nestedGroup, nextPrefix)));
    }

    return lines;
}

async function renderLlmsFullTxt(routes: string[], catalog: CatalogEntry[]): Promise<string> {
    const lines = [
        '# Nango Docs',
        '',
        '> Curated full-text context for Nango core docs. Provider-specific API pages are excluded to keep this file focused; use the API catalog section at the end to discover supported provider slugs.',
        ''
    ];

    for (const route of routes) {
        const meta = await readPageMeta(route);
        const rawContent = await fs.readFile(meta.filePath, 'utf-8');
        const content = stripMdxBoilerplate(rawContent).trim();

        lines.push(`## ${meta.title}`);
        lines.push('');
        lines.push(`Source: ${routeToMarkdownUrl(route)}`);
        if (meta.description) {
            lines.push(`Description: ${meta.description}`);
        }
        lines.push('');
        lines.push(content);
        lines.push('');
    }

    lines.push('## API and Integration Catalog');
    lines.push('');
    lines.push('Use these slugs to construct provider-specific docs URLs only when needed.');
    lines.push('');
    lines.push(renderCatalogTable(catalog));
    lines.push('');

    return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

async function buildCatalog(routes: string[]): Promise<CatalogEntry[]> {
    const entries = new Map<string, CatalogEntry>();
    const navRoutesBySlug = new Map(routes.map((route) => [providerSlugFromRoute(route), route]).filter((entry): entry is [string, string] => !!entry[0]));
    const slugs = unique([...Object.keys(providers), ...navRoutesBySlug.keys()]);

    for (const slug of slugs) {
        if (entries.has(slug)) {
            continue;
        }

        const provider = providers[slug];
        const providerConfig = resolveProviderCatalogConfig(provider);
        const providerDocsRoute = provider?.docs ? urlToDocsRoute(provider.docs) : undefined;
        const navRoute = navRoutesBySlug.get(slug);
        const routeWithFile = routeForExistingProviderPage(providerDocsRoute ?? navRoute ?? `integrations/all/${slug}`, slug);
        const meta = await readPageMeta(routeWithFile);
        const existingConnectRoute = routeForExistingOptionalPage(routeWithFile, 'connect');
        const providerConnectRoute = provider?.docs_connect ? urlToDocsRoute(provider.docs_connect) : undefined;
        const connectRoute = selectConnectRoute(providerConnectRoute, routeWithFile, existingConnectRoute);
        const setupGuideUrl = providerConfig.provider?.setup_guide_url ?? providerConfig.inheritedProvider?.setup_guide_url;
        const setupRoute = setupGuideUrl ? urlToDocsRoute(setupGuideUrl) : routeForExistingSetupPage(routeWithFile);

        entries.set(slug, {
            slug,
            title: providerConfig.provider?.display_name ?? providerConfig.inheritedProvider?.display_name ?? meta.title,
            authMode: providerConfig.provider?.auth_mode ?? providerConfig.inheritedProvider?.auth_mode ?? '',
            route: routeWithFile,
            connectRoute: connectRoute ?? '',
            setupRoute: setupRoute ?? '',
            categories: (providerConfig.provider?.categories ?? providerConfig.inheritedProvider?.categories)?.join(', ') ?? ''
        });
    }

    return [...entries.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function resolveProviderCatalogConfig(provider: ProviderConfig | undefined): ProviderCatalogConfig {
    if (!provider?.alias) {
        return { provider };
    }

    return {
        provider,
        inheritedProvider: providers[provider.alias]
    };
}

function selectConnectRoute(providerRoute: string | undefined, docsRoute: string, existingConnectRoute: string | undefined): string | undefined {
    const normalizedProviderRoute = providerRoute ? stripKnownExtension(providerRoute) : undefined;

    if (
        existingConnectRoute &&
        (!normalizedProviderRoute || normalizedProviderRoute === docsRoute || !fileExistsSync(routeToFilePath(normalizedProviderRoute)))
    ) {
        return existingConnectRoute;
    }

    if (normalizedProviderRoute && normalizedProviderRoute !== docsRoute) {
        return normalizedProviderRoute;
    }

    return undefined;
}

function renderApiCatalog(catalog: CatalogEntry[]): string {
    return [
        '# Nango API and Integration Catalog',
        '',
        '> Compact provider slug catalog for agents. Use the slug to reconstruct provider-specific docs URLs only when needed.',
        '',
        `Provider count: ${catalog.length}`,
        '',
        'URL patterns:',
        `- Main provider page: ${baseUrl}/integrations/all/{slug}.md or ${baseUrl}/api-integrations/{slug}.md`,
        `- Connect guide when available: ${baseUrl}/integrations/all/{slug}/connect.md or ${baseUrl}/api-integrations/{slug}/connect.md`,
        '',
        renderCatalogTable(catalog),
        ''
    ].join('\n');
}

function renderCatalogTable(catalog: CatalogEntry[]): string {
    return [
        '| Slug | Name | Auth mode | Docs | Connect | Setup | Categories |',
        '| - | - | - | - | - | - | - |',
        ...catalog.map(
            (entry) =>
                `| ${[
                    inlineCode(entry.slug),
                    escapeTable(entry.title),
                    escapeTable(entry.authMode),
                    entry.route ? `[docs](${routeToMarkdownUrl(entry.route)})` : '',
                    entry.connectRoute ? `[connect](${routeToMarkdownUrl(entry.connectRoute)})` : '',
                    entry.setupRoute ? `[setup](${routeToMarkdownUrl(entry.setupRoute)})` : '',
                    escapeTable(entry.categories)
                ].join(' | ')} |`
        )
    ].join('\n');
}

async function readPageMeta(route: string): Promise<PageMeta> {
    const filePath = routeToFilePath(route);
    const raw = await fs.readFile(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(raw);
    const fallbackTitle = titleFromRoute(route);

    return {
        route,
        title: frontmatter.title ?? frontmatter.sidebarTitle ?? fallbackTitle,
        description: frontmatter.description,
        filePath
    };
}

function parseFrontmatter(content: string): Frontmatter {
    const match = /^---\n([\s\S]*?)\n---/.exec(content);
    if (!match?.[1]) {
        return {};
    }

    const data = yaml.load(match[1]) as Frontmatter | undefined;
    return data ?? {};
}

function stripMdxBoilerplate(content: string): string {
    let inCodeFence = false;

    return content
        .replace(/^---\n[\s\S]*?\n---\n?/, '')
        .split('\n')
        .filter((line) => {
            if (/^\s*(```|~~~)/.test(line)) {
                inCodeFence = !inCodeFence;
                return true;
            }

            return inCodeFence || !/^import\s/.test(line);
        })
        .join('\n')
        .trim();
}

function renderLink(meta: PageMeta, prefix = ''): string {
    const description = meta.description ? `: ${meta.description}` : '';
    return `- [${escapeLinkText(prefix + meta.title)}](${routeToMarkdownUrl(meta.route)})${description}`;
}

function routeToFilePath(route: string): string {
    return path.join(docsRoot, `${route}.mdx`);
}

function routeToMarkdownUrl(route: string): string {
    return `${baseUrl}/${route}.md`;
}

function urlToDocsRoute(url: string): string | undefined {
    const match = /\/docs\/(.+?)(?:\.md)?\/?$/.exec(url);
    return match?.[1];
}

function providerSlugFromRoute(route: string): string | undefined {
    if (route.startsWith('integrations/all/')) {
        return route.split('/')[2];
    }

    if (route.startsWith('api-integrations/')) {
        return route.split('/')[1];
    }

    return undefined;
}

function isProviderRoute(route: string): boolean {
    return providerSlugFromRoute(route) !== undefined;
}

function routeForExistingProviderPage(route: string, slug: string): string {
    const directRoute = stripKnownExtension(route);
    const fallbackRoutes = [`integrations/all/${slug}`, `api-integrations/${slug}`];

    for (const candidate of unique([directRoute, ...fallbackRoutes])) {
        if (fileExistsSync(routeToFilePath(candidate))) {
            return candidate;
        }
    }

    return directRoute;
}

function routeForExistingOptionalPage(route: string, page: string): string | undefined {
    const candidate = `${route}/${page}`;
    return fileExistsSync(routeToFilePath(candidate)) ? candidate : undefined;
}

function routeForExistingSetupPage(route: string): string | undefined {
    const directory = routeToFilePath(route).replace(/\.mdx$/, '');

    try {
        const entries = fsSync.readdirSync(directory);
        const setupFile = entries.find((entry) => entry.endsWith('.mdx') && entry.startsWith('how-to-register-your-own-'));
        return setupFile ? `${route}/${setupFile.replace(/\.mdx$/, '')}` : undefined;
    } catch {
        return undefined;
    }
}

function fileExistsSync(filePath: string): boolean {
    return fsSync.existsSync(filePath);
}

function stripKnownExtension(route: string): string {
    return route.replace(/\.mdx?$/, '');
}

function titleFromRoute(route: string): string {
    return route
        .split('/')
        .at(-1)!
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function escapeLinkText(text: string): string {
    return text.replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function escapeTable(text: string): string {
    return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function inlineCode(text: string): string {
    return `\`${text.replaceAll('`', '')}\``;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}
