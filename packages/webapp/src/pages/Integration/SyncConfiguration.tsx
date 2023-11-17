import { Integration } from './Show';

interface SyncConfigurationProps {
    integration: Integration | null;
}

export default function SyncConfiguration(props: SyncConfigurationProps) {
    const { integration } = props;
    //const [loaded, setLoaded] = useState(false);
    console.log(integration);

    return (
        <div className="mx-auto w-largebox">
            yo
        </div>
    );
}
