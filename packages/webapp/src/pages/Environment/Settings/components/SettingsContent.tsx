const SettingsContent: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => {
    return (
        <div className="text-text-strong flex flex-col rounded-sm border-2 border-border-disabled h-full">
            <div className="text-body-large-semi bg-surface-panel h-10 flex items-center justify-between p-6">
                <h2>{title}</h2>
                {action}
            </div>
            <div className="flex flex-col gap-9 w-full px-6 flex-1 py-9">{children}</div>
        </div>
    );
};

export default SettingsContent;
