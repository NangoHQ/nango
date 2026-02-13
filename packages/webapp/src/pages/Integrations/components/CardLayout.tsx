export const CardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div>{children}</div>;
};

export const CardHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <header className="flex flex-col gap-6 px-11 py-8 bg-bg-elevated border border-b-0 border-border-muted rounded-t-md">{children}</header>;
};

export const CardSubheader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div className="p-11 bg-bg-subtle border-x border-border-muted">{children}</div>;
};

export const CardContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div className="px-11 py-8 border border-t-0 border-border-muted rounded-b-md">{children}</div>;
};
