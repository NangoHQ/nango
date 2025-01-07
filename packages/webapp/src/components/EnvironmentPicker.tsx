import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/Popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/Command';
import { useMeta } from '../hooks/useMeta';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { Button } from './ui/button/Button';
import { useStore } from '../store';
import { cn } from '../utils/utils';
import { useEnvironment } from '../hooks/useEnvironment';

export const EnvironmentPicker: React.FC = () => {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);

    const { meta } = useMeta();
    const { mutate } = useEnvironment(env);
    const [open, setOpen] = useState(false);

    const onSelect = (selected: string) => {
        if (selected === env) {
            return;
        }

        setEnv(selected);
        void mutate();

        const pathSegments = window.location.pathname.split('/').filter(Boolean);

        pathSegments[0] = selected;

        let newPath = `/${pathSegments.join('/')}`;

        // If on 'integration' or 'connections' subpages beyond the second level, redirect to their parent page
        if (pathSegments[1] === 'integrations' && pathSegments.length > 2) {
            newPath = `/${selected}/integrations`;
        } else if (pathSegments[1] === 'connections' && pathSegments.length > 2) {
            newPath = `/${selected}/connections`;
        }

        navigate(newPath);
    };

    if (!meta) {
        return;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button role="combobox" variant={'select'} className="justify-between grow w-full capitalize border-grayscale-600 px-2.5">
                    {env}
                    <IconChevronDown stroke={1} size={18} />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="start"
                style={{ width: 'var(--radix-popover-trigger-width)' }}
                className="bg-grayscale-900 w-full px-0 border-grayscale-700 py-0"
            >
                <Command>
                    {meta.environments.length > 2 && (
                        <CommandInput
                            placeholder="Search..."
                            className="text-white ring-0 focus:ring-0 focus-visible:outline-none border-transparent border-b-grayscale-700 rounded-b-none px-2.5    "
                        ></CommandInput>
                    )}
                    <CommandList className="max-h-[400px]">
                        <CommandEmpty>No environment found.</CommandEmpty>
                        <CommandGroup className="px-0">
                            {meta.environments.map((item) => (
                                <CommandItem key={item.name} value={item.name} className={cn('capitalize px-2.5 text-grayscale-100')} onSelect={onSelect}>
                                    {item.name}
                                    <IconCheck className={cn('ml-auto', env === item.name ? 'opacity-100' : 'opacity-0')} size={18} />
                                </CommandItem>
                            ))}
                        </CommandGroup>

                        {/* <div className="px-2.5 py-2.5">
                            <Button variant={'tertiary'} className="w-full justify-center">
                                Create environment
                            </Button>
                        </div> */}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
