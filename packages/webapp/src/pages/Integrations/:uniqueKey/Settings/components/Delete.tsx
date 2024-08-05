import { useState } from 'react';
import Button from '../../../../../components/ui/button/Button';
import { apiDeleteIntegration } from '../../../../../hooks/useIntegration';
import type { ApiIntegration } from '@nangohq/types';
import { useToast } from '../../../../../hooks/useToast';
import { useNavigate } from 'react-router-dom';
import { mutate } from 'swr';

export const DeleteIntegrationButton: React.FC<{ env: string; integration: ApiIntegration }> = ({ env, integration }) => {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const onDelete = async () => {
        setLoading(true);

        const deleted = await apiDeleteIntegration(env, integration.unique_key);

        setLoading(false);
        if ('error' in deleted.json) {
            toast({ title: deleted.json.error.message || 'Failed to delete, an error occurred', variant: 'error' });
        } else {
            toast({ title: `Deleted integration ${integration.unique_key}`, variant: 'success' });
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integration`), undefined);
            navigate(`/${env}/integrations`);
        }
    };

    return (
        <Button type="button" variant={'danger'} onClick={onDelete} isLoading={loading}>
            Delete
        </Button>
    );
};
