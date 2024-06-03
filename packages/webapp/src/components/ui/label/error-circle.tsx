import { XMarkIcon } from '@heroicons/react/24/outline';

export function ErrorCircle() {
    return (
        <span className="mx-1 cursor-auto flex h-3 w-3 rounded-full ring-red-base/[.35] ring-4">
            <span className="flex items-center rounded-full bg-red-base h-3 w-3">
                <XMarkIcon className="ml-[2px] h-2 w-2 text-pure-black" />
            </span>
        </span>
    );
}
