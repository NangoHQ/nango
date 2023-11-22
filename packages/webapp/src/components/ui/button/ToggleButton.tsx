interface ToggleButtonProps {
    enabled: boolean;
    onChange: () => void;
}

export default function ToggleButton({ enabled, onChange }: ToggleButtonProps) {
    return (
       <label className="inline-flex items-center cursor-pointer">
            <span className="relative">
                <span className={`block w-7 h-3.5 ${enabled ? 'bg-green-600' : 'bg-zinc-500'} rounded-full shadow-inner`}></span>
                <span className={`absolute block w-3 h-3 mt-[1px] ml-0.5 rounded-full shadow inset-y-0 left-0 focus-within:shadow-outline transition-transform duration-300 ease-in-out ${enabled ? 'transform translate-x-full bg-black' : 'bg-black'}`}>
                    <input type="checkbox" onChange={onChange} className="absolute opacity-0 w-0 h-0" />
                </span>
            </span>
        </label>
    );
}
