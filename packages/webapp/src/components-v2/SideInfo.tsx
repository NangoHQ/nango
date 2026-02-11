export const SideInfo: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div className="flex flex-col min-w-30 w-60 shrink-0">{children}</div>;
};

export const SideInfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
    return (
        <div className="flex flex-col gap-1 px-5 py-4.5 not-last:border-b border-border-muted">
            <span className="text-text-tertiary text-body-medium-regular">{label}</span>
            <div className="text-text-primary text-body-medium-regular">{children}</div>
        </div>
    );
};
