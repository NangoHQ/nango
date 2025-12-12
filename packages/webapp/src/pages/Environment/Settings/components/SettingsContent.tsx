const SettingsContent: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    return (
        <div className="text-grayscale-100 flex flex-col rounded-sm border-2 border-grayscale-900 h-full">
            <div className="text-lg font-semibold bg-grayscale-900 h-10 flex items-center p-6">
                <h2>{title}</h2>
            </div>
            <div className="flex flex-col gap-4 w-full py-9 px-6 flex-1">{children}</div>
        </div>
    );
};

export default SettingsContent;
