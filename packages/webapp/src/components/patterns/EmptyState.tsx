export const EmptyState: React.FC<{ title: string; help: React.ReactNode; children?: React.ReactNode }> = ({ title, help, children }) => {
    return (
        <div className="flex gap-2 flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
            <h2 className="text-xl text-center">{title}</h2>
            <div className="text-sm text-gray-400">{help}</div>
            {children}
        </div>
    );
};
