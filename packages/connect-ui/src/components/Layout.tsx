export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="absolute h-screen  w-screen overflow-hidden flex flex-col items-center pt-[50px] pb-[50px] bg-dark-800 bg-opacity-60">
            <div className="overflow-hidden flex flex-col bg-white rounded-xl w-[500px] h-full min-h-[500px]">{children}</div>
        </div>
    );
};
