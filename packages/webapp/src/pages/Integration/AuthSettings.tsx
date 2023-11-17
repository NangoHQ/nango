import { Integration } from './Show';

interface AuthSettingsProps {
    integration: Integration | null;
}

export default function AuthSettings(props: AuthSettingsProps) {
    const { integration } = props;
    //const [loaded, setLoaded] = useState(false);
    console.log(integration);

    return (
        <div className="mx-auto w-largebox">
            yo
        </div>
    );
}

