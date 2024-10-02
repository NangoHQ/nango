export const ErrorFallback: React.FC = () => {
    return <div className="p-4 text-red-base text-center">An error occurred. Please refresh your page or contact our support.</div>;
};

export const ErrorFallbackGlobal: React.FC = () => {
    return (
        <div className="absolute h-screen  w-screen overflow-hidden flex flex-col items-center pt-[50px] pb-[50px] bg-dark-800 bg-opacity-60">
            <div className="overflow-hidden flex flex-col bg-white rounded-xl w-[500px] h-full min-h-[500px] items-center justify-center">
                <ErrorFallback />
            </div>
        </div>
    );
};
