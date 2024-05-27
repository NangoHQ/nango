import { useStore } from '../store';

export const DebugMode: React.FC = () => {
    const debugMode = useStore((state) => state.debugMode);

    if (!debugMode) {
        return null;
    }

    return <div className="bg-red-500 px-3 py-1 bg-opacity-60 text-white text-xs w-full z-[100] text-center">Debug mode activated</div>;
};
