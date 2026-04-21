const SettingsContent: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    return (
        <div className="text-text-primary flex flex-col rounded-sm border-2 border-border-disabled h-full">
            <div className="text-body-large-semi bg-bg-elevated h-10 flex items-center p-6">
                <h2>{title}</h2>
            </div>
            <div className="flex flex-col gap-9 w-full px-6 flex-1 py-9">{children}</div>
        </div>
    );
};

export default SettingsContent;
