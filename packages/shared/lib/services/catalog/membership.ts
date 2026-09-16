export type CatalogActionOverrides = Record<string, boolean>;

export function isCatalogActionEnabled({ name, autoEnable, overrides }: { name: string; autoEnable: boolean; overrides: CatalogActionOverrides }): boolean {
    if (Object.hasOwn(overrides, name)) {
        return overrides[name] === true;
    }
    return autoEnable;
}

/**
 * Flips the catalog overrides map when flipping `auto_enable_catalog_actions` on an existing integration.
 * Preserves manually toggled overrides.
 */
export function complementCatalogOverrides({
    catalogNames,
    deployedNames,
    previousOverrides,
    newFlag
}: {
    catalogNames: Iterable<string>;
    deployedNames: ReadonlySet<string>;
    previousOverrides: CatalogActionOverrides;
    newFlag: boolean;
}): CatalogActionOverrides {
    const previousKeys = new Set(Object.keys(previousOverrides));
    const next: CatalogActionOverrides = {};
    for (const name of catalogNames) {
        if (deployedNames.has(name) || previousKeys.has(name)) {
            continue;
        }
        next[name] = !newFlag;
    }
    return next;
}
