import Button from '../../../components/ui/button/Button';
import { BookOpenIcon } from '@heroicons/react/24/outline';

export default function HelpFooter() {
    return (
        <div className="my-10 space-x-3">
            <a href="https://docs.nango.dev/customize/guides/create-a-custom-integration" target="_blank" rel="noreferrer">
                <Button variant="zinc">
                    <BookOpenIcon className="flex h-5 w-5 cursor-pointer hover:text-zinc-400" onClick={() => true} />
                    <span>Build Custom</span>
                </Button>
            </a>
        </div>
    );
}

