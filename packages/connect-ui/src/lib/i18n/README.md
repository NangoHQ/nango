# Internationalization (i18n) System

This is a lightweight internationalization system for the Connect UI. It uses React Context and dynamic imports to provide translations without loading unnecessary language files.

## Features

- Dynamic loading of language files (only loads the languages being used)
- Automatic language detection based on browser settings
- Simple API for accessing translations
- TypeScript support
- Loading state handling
- String templating with named variables
- English fallback for missing translations

## Usage

### 1. Access translations in components

```tsx
import { useI18n } from '@/lib/i18n';

const MyComponent: React.FC = () => {
    const { t, language, setLanguage, isLoading } = useI18n();

    return (
        <div>
            <h1>{t('common.title')}</h1>
            <p>{t('common.description')}</p>

            {/* Show loading state */}
            {isLoading && <p>Loading translations...</p>}

            {/* Switch language */}
            <button onClick={() => setLanguage('fr')}>{t('common.switchLanguage')}</button>
        </div>
    );
};
```

### 2. Add new translations

1. Create a new file in `src/lib/i18n/translations/` named after the language code (e.g., `de.ts` for German)
2. Export a default object with the same structure as other translation files
3. Add the language to the supported languages list in `src/lib/i18n/context.tsx` and `src/lib/i18n/utils.ts`

### 3. String replacement

For strings that need dynamic values, use the `{name}` format with named variables:

```tsx
// In your component:
const { t } = useI18n();
const name = 'API';

// Replace {provider} with the name
const translatedString = t('integration.connect', { provider: name });
```

You can use multiple variables in a single string:

```tsx
// Translation: "Hello {name}, you have {count} messages"
t('common.greeting', { name: 'John', count: 5 });
```

### 4. Fallback behavior

When a translation key is missing in a non-English language:

1. The system first tries to find the key in the current language
2. If not found, it automatically looks for the English translation
3. If still not found, it returns the key itself as a last resort

This ensures your UI always has text to display, even if a translation is incomplete.

## Structure

- `context.tsx` - The React Context provider and hook for accessing translations
- `utils.ts` - Utility functions like language detection and string formatting
- `translations/` - Directory containing language files
    - `en.ts` - English translations
    - `fr.ts` - French translations
    - etc.
- `index.ts` - Re-exports from the i18n module

## Adding support for date/number formatting

For more advanced i18n features like date and number formatting, consider extending this system or integrating with libraries like Intl.NumberFormat and Intl.DateTimeFormat from the JavaScript Internationalization API.
