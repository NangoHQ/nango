import { useEffect, useMemo, useState } from 'react';

import { Input } from '../../../components/ui/input/Input';
import { HoverCard, HoverCardContent, HoverCardTrigger, HoverCardArrow } from '../../../components/ui/HoverCard';
import { Progress } from '../../../components/ui/Progress';

export const Password: React.FC<{ setPassword: (password: string, strength: number) => void } & React.InputHTMLAttributes<HTMLInputElement>> = ({
    setPassword,
    ...props
}) => {
    const [local, setLocal] = useState('');
    const { strength, color } = useMemo(() => {
        let strength = 0;
        if (local.length >= 1) {
            strength += 12.5;
        }
        if (local.length > 8) {
            strength += 12.5;
        }
        if (local.match(/[A-Z]/)) {
            strength += 25;
        }
        if (local.match(/[0-9]/)) {
            strength += 25;
        }
        if (local.match(/[^a-zA-Z0-9]/)) {
            strength += 25;
        }

        const color = strength <= 25 ? 'bg-gray-500' : strength <= 50 ? 'bg-red-base' : strength < 100 ? 'bg-yellow-base' : 'bg-green-base';
        return { strength, color };
    }, [local]);

    useEffect(() => {
        setPassword(local, strength);
    }, [strength, local]);

    return (
        <HoverCard openDelay={0}>
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
                        {...props}
                    />
                    <Progress value={strength} className="bg-dark-600 h-[3px]" bgBar={color} />
                </div>
            </HoverCardTrigger>
            <HoverCardContent align="start" side="right" sideOffset={10} arrowPadding={2}>
                <HoverCardArrow className="fill-active-gray" />
                <div className="text-xs text-gray-400">At least 8 characters with lowercase, uppercase, a number and a special character</div>
            </HoverCardContent>
        </HoverCard>
    );
};
