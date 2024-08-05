export const InfoBloc: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    return (
        <div className="flex flex-col relative min-w-[400px]">
            <div className="flex items-center mb-1">
                <div className="text-gray-400 text-xs uppercase">{title}</div>
            </div>
            <div className="flex items-center gap-2 text-white text-sm">{children}</div>
        </div>
    );
};
