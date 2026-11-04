// `popular` has its own section, and `other` isn't something anyone browses for.
const HIDDEN_CATEGORIES = new Set(['popular', 'other']);

const CATEGORY_LABELS: Record<string, string> = {
    accounting: 'Accounting',
    analytics: 'Analytics',
    ats: 'ATS',
    banking: 'Banking',
    cms: 'CMS',
    communication: 'Communication',
    crm: 'CRM',
    design: 'Design',
    'dev-tools': 'Developer tools',
    'e-commerce': 'E-commerce',
    erp: 'ERP',
    gaming: 'Gaming',
    hr: 'HR',
    iam: 'IAM',
    invoicing: 'Invoicing',
    'knowledge-base': 'Knowledge base',
    legal: 'Legal',
    marketing: 'Marketing',
    mcp: 'MCP',
    payment: 'Payments',
    productivity: 'Productivity',
    search: 'Search',
    social: 'Social',
    sports: 'Sports',
    storage: 'Storage',
    support: 'Support',
    surveys: 'Surveys',
    ticketing: 'Ticketing',
    video: 'Video'
};

export function getCategoryLabel(category: string): string {
    return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1).replaceAll('-', ' ');
}

export function getBrowsableCategories(provider: { categories?: string[] | undefined }): string[] {
    return (provider.categories ?? []).filter((category) => !HIDDEN_CATEGORIES.has(category));
}

export function listBrowsableCategories(providers: { categories?: string[] | undefined }[]): string[] {
    const categories = new Set(providers.flatMap(getBrowsableCategories));
    return [...categories].sort((a, b) => getCategoryLabel(a).localeCompare(getCategoryLabel(b)));
}

export const NANGO_MANAGED_FILTER = 'nango-managed';

export function matchesFilter(provider: { categories?: string[] | undefined; preConfigured: boolean }, filter: string): boolean {
    return filter === NANGO_MANAGED_FILTER ? provider.preConfigured : (provider.categories?.includes(filter) ?? false);
}

export function getFilterLabel(filter: string): string {
    return filter === NANGO_MANAGED_FILTER ? 'Nango-managed app' : getCategoryLabel(filter);
}
