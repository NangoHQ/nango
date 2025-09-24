import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from './ui/button';
import { SlackIcon } from '@/assets/SlackIcon';

export const AppHeader: React.FC = () => {
    return (
        <header className="h-16 px-10 py-2.5 items-center flex justify-end gap-1.5">
            <Link to="https://docs.nango.dev">
                <Button variant="secondary" size="sm">
                    <BookOpen />
                    Docs
                </Button>
            </Link>
            <Link to="https://nango.dev/slack">
                <Button variant="secondary" size="sm">
                    <SlackIcon />
                    Help
                </Button>
            </Link>
        </header>
    );
};
