export const NoticePanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="flex gap-2 flex-col border border-border-muted rounded-md items-center text-text-strong text-center p-10 py-20">
        <h2 className="text-xl text-center">{title}</h2>
        <div className="text-sm text-text-muted">{children}</div>
    </div>
);
