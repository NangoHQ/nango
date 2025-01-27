import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/Popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/Command';
import { useMeta } from '../hooks/useMeta';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { Button } from './ui/button/Button';
import { useStore } from '../store';
import { cn } from '../utils/utils';
import { apiPostEnvironment } from '../hooks/useEnvironment';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger, DialogClose } from '../components/ui/Dialog';
import { Input } from './ui/input/Input';
import { Info } from './Info';
import { useToast } from '../hooks/useToast';

export const EnvironmentPicker: React.FC = () => {
    const navigate = useNavigate();
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);

    const { meta, mutate } = useMeta();
    const [open, setOpen] = useState(false);

    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [name, setName] = useState('');

    const onSelect = (selected: string) => {
        if (selected === env) {
            return;
        }

        setEnv(selected);

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

    const onCreate = async () => {
        setLoading(true);

        const res = await apiPostEnvironment({ name });
        if ('error' in res.json) {
            const err = res.json.error;
            if (err.code === 'conflict') {
                toast({ title: 'Environment name already exists', variant: 'error' });
            } else if (err.code === 'invalid_body') {
                setError(true);
            } else if (err.code === 'feature_disabled' || err.code === 'resource_capped') {
                toast({ title: err.message, variant: 'error' });
            } else {
                toast({ title: 'Failed to create environment', variant: 'error' });
            }
        } else {
            navigate(`/${res.json.data.name}`);
            setOpen(false);
            setOpenDialog(false);
            setError(false);
            setName('');
            void mutate();
        }

        setLoading(false);
    };

    if (!meta) {
        return;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button role="combobox" variant={'select'} className="justify-between grow w-full capitalize border-grayscale-600 px-2.5 whitespace-pre">
                    <div className="text-ellipsis overflow-hidden">{env}</div>
                    <div className="w-4">
                        <IconChevronDown stroke={1} size={18} />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="start"
                style={{ width: 'var(--radix-popover-trigger-width)' }}
                className="bg-grayscale-900 w-full px-0 border-grayscale-700 py-0"
            >
                <Command>
                    {meta.environments.length > 5 && (
                        <CommandInput
                            placeholder="Search..."
                            className="text-white ring-0 focus:ring-0 focus-visible:outline-none border-transparent border-b-grayscale-700 rounded-b-none px-2.5    "
                        ></CommandInput>
                    )}
                    <CommandList className="max-h-[400px]">
                        <CommandEmpty>No environment found.</CommandEmpty>
                        <CommandGroup className="px-0 max-h-[340px] overflow-y-scroll">
                            {meta.environments.map((item) => (
                                <CommandItem
                                    key={item.name}
                                    value={item.name}
                                    className={cn('capitalize px-2.5 text-grayscale-100 overflow-hidden whitespace-pre')}
                                    onSelect={onSelect}
                                >
                                    <div className="text-ellipsis overflow-hidden">{item.name}</div>
                                    <IconCheck className={cn('ml-auto', env === item.name ? 'opacity-100' : 'opacity-0')} size={18} />
                                </CommandItem>
                            ))}
                        </CommandGroup>

                        <div className="px-2.5 py-2.5">
                            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                                <DialogTrigger asChild>
                                    <Button variant={'tertiary'} className="w-full justify-center">
                                        Create environment
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-[550px]">
                                    <DialogTitle>Environment Name</DialogTitle>
                                    <div>
                                        <Input
                                            placeholder="my-environment-name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            variant={'black'}
                                            onKeyUp={(e) => e.code === 'Enter' && onCreate()}
                                        />
                                        <div className={cn('text-xs text-grayscale-500', error && 'text-alert-400')}>
                                            *Must be lowercase letters, numbers, underscores and dashes.
                                        </div>
                                    </div>
                                    <Info>
                                        Only the Prod environment is billed. Other environments are free, with restrictions making them unsuitable for
                                        production.
                                    </Info>
                                    <DialogFooter className="mt-4">
                                        <DialogClose asChild>
                                            <Button variant={'zinc'}>Cancel</Button>
                                        </DialogClose>
                                        <Button variant={'primary'} onClick={onCreate} isLoading={loading} type="submit">
                                            Create environment
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
