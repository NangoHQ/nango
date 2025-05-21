import { useI18n } from '@/lib/i18n/context';

import type { Language } from '@/lib/i18n/context';

export const LanguageSwitcher: React.FC = () => {
    const { language, setLanguage, isLoading, t } = useI18n();

    const languages = [
        { code: 'en', name: 'English' },
        { code: 'fr', name: 'Français' }
    ];

    return (
        <div className="flex items-center gap-2">
            {isLoading && <span className="text-xs text-gray-500">{t('common.loading')}</span>}
            <select
                aria-label={t('common.switchLanguage')}
                className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                disabled={isLoading}
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
            >
                {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                        {lang.name}
                    </option>
                ))}
            </select>
        </div>
    );
};
