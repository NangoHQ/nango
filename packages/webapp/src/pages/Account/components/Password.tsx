import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useState } from 'react';

import { HoverCard, HoverCardArrow, HoverCardContent, HoverCardTrigger } from '../../../components/ui/HoverCard';
import { Input } from '../../../components/ui/input/Input';
import { cn } from '../../../utils/utils';

export const Password: React.FC<{ setPassword: (password: string, good: boolean) => void } & React.InputHTMLAttributes<HTMLInputElement>> = ({
    setPassword,
    ...props
}) => {
    const [local, setLocal] = useState('');
    const [open, setOpen] = useState(false);
    const checks = useMemo(() => {
        return {
            length: local.length >= 8,
            uppercase: local.match(/[A-Z]/) !== null,
            number: local.match(/[0-9]/) !== null,
            special: local.match(/[^a-zA-Z0-9]/) !== null
        };
    }, [local]);

    useEffect(() => {
        setPassword(local, checks.length && checks.uppercase && checks.number && checks.special);
    }, [checks, local]);

    return (
        <HoverCard openDelay={0} open={open}>
            <HoverCardTrigger>
                <div className="flex flex-col gap-2">
                    <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Password"
                        minLength={8}
                        maxLength={64}
                        inputSize="lg"
                        value={local}
                        required
                        onChange={(e) => setLocal(e.target.value)}
                        className="border-border-gray bg-dark-600"
                        onFocus={() => setOpen(true)}
                        onBlur={() => setOpen(false)}
                        {...props}
                    />
                </div>
            </HoverCardTrigger>
            <HoverCardContent align="start" side="right" sideOffset={10} arrowPadding={2}>
                <HoverCardArrow className="fill-active-gray" />
                <div className="text-xs text-gray-400 flex flex-col gap-2">
                    <div className={cn('flex gap-2 items-center', checks.length && 'text-green-base')}>
                        {checks.length ? <CheckCircledIcon /> : <CrossCircledIcon />} At least 8 characters
                    </div>
                    <div className={cn('flex gap-2 items-center', checks.uppercase && 'text-green-base')}>
                        {checks.uppercase ? <CheckCircledIcon /> : <CrossCircledIcon />} 1 uppercase letter
                    </div>
                    <div className={cn('flex gap-2 items-center', checks.number && 'text-green-base')}>
                        {checks.number ? <CheckCircledIcon /> : <CrossCircledIcon />} 1 number
                    </div>
                    <div className={cn('flex gap-2 items-center', checks.special && 'text-green-base')}>
                        {checks.special ? <CheckCircledIcon /> : <CrossCircledIcon />} 1 special character
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};
