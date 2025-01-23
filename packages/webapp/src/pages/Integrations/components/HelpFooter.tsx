import { Button } from '../../../components/ui/button/Button';
import { BookOpenIcon } from '@heroicons/react/24/outline';

export const HelpFooter: React.FC = () => {
    return (
        <a href="https://docs.nango.dev/guides/custom-integrations/overview" target="_blank" rel="noreferrer">
            <Button variant="zinc">
                <BookOpenIcon className="flex h-5 w-5 cursor-pointer hover:text-zinc-400" onClick={() => true} />
                <span>Build Custom</span>
            </Button>
        </a>
    );
};
