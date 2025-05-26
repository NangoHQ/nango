import type { Translation } from './en';

const de: Translation = {
    common: {
        close: 'Schließen',
        loading: 'Laden',
        back: 'Zurück',
        finish: 'Fertig',
        tryAgain: 'Erneut versuchen',
        connecting: 'Verbinde...',
        connect: 'Verbinden',
        viewGuide: 'Verbindungsanleitung anzeigen',
        needHelp: 'Benötigen Sie Hilfe?'
    },
    integrationsList: {
        title: 'Integration auswählen',
        description: 'Bitte wählen Sie eine API-Integration aus der Liste unten aus.',
        noIntegrations: 'Keine Integration gefunden.',
        connectTo: 'Mit {provider} verbinden',
        error: 'Beim Laden der Konfiguration ist ein Fehler aufgetreten'
    },
    go: {
        linkAccount: '{provider}-Konto verknüpfen',
        connect: 'Verbinden',
        success: 'Erfolgreich!',
        successMessage: 'Sie haben Ihre {provider}-Integration erfolgreich eingerichtet',
        connectionFailed: 'Verbindung fehlgeschlagen',
        tryAgain: 'Bitte versuchen Sie es erneut',
        backToList: 'Zurück zur Integrationsliste',
        willConnect: 'Wir werden Sie mit {provider} verbinden',
        popupWarning: 'Ein Popup wird geöffnet, stellen Sie sicher, dass Ihr Browser Popups nicht blockiert',
        popupBlocked: 'Auth-Popup von Ihrem Browser blockiert, bitte erlauben Sie Popups',
        popupClosed: 'Das Auth-Popup wurde vor Ende des Prozesses geschlossen, bitte versuchen Sie es erneut',
        invalidCredentials: '{provider} hat Ihre Anmeldedaten nicht validiert. Bitte überprüfen Sie die Werte und versuchen Sie es erneut.',
        resourceCapped: 'Sie haben die maximale Anzahl erlaubter Verbindungen erreicht. Bitte wenden Sie sich an den Administrator.',
        invalidPreconfigured: 'Ein vom Administrator festgelegtes vorkonfiguriertes Feld ist ungültig, bitte wenden Sie sich an den Support'
    }
};

export default de;
