interface SettingsContentProps {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}

const SettingsContent: React.FC<SettingsContentProps> = ({ title, action, children }) => {
    return (
        <div className="text-text-strong flex h-full flex-col rounded-sm border-2 border-border-disabled">
            <div className="text-body-large-semi flex h-10 items-center justify-between bg-surface-panel p-6">
                <h2>{title}</h2>
                {action}
            </div>
            <div className="flex w-full flex-1 flex-col gap-9 px-6 py-9">{children}</div>
        </div>
    );
};

export default SettingsContent;
