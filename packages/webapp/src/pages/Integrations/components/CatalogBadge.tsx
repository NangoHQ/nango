export const CatalogBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div className="px-2 py-0.5 rounded-xs bg-bg-subtle text-text-secondary text-body-extra-small-semi uppercase">{children}</div>;
};
