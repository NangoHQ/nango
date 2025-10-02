import { useEffect, useRef } from 'react';

import { ButtonLink } from '@/components-v2/ui/button';
import { useStore } from '@/store';

interface ThirdStepProps {
    onSetupIntegrationClicked: () => void;
}

export const ThirdStep = ({ onSetupIntegrationClicked }: ThirdStepProps) => {
    const env = useStore((state) => state.env);
    const componentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (componentRef.current) {
            componentRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }, []);

    return (
        <div ref={componentRef} className="flex flex-col gap-7">
            <div className="flex flex-col gap-1.5 text-sm">
                <h3 className="text-brand-500 font-semibold">Congrats!</h3>
                <p className="text-text-primary">Now that you’ve had a glimpse of Nango, you can go ahead and configure your first integration!</p>
            </div>

            <ButtonLink to={`/${env}/integrations/create`} onClick={onSetupIntegrationClicked} variant="primary" size="lg">
                Set up integration
            </ButtonLink>
        </div>
    );
};
