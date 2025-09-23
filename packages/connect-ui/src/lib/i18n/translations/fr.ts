import type { Translation } from './en';

const fr: Translation = {
    common: {
        close: 'Fermer',
        loading: 'Chargement',
        back: 'Retour',
        finish: 'Terminer',
        tryAgain: 'Réessayer',
        connecting: 'Connexion en cours...',
        connect: 'Connecter',
        viewGuide: 'Voir le guide de connexion',
        needHelp: "Besoin d'aide ?"
    },
    integrationsList: {
        title: 'Sélectionner une intégration',
        description: 'Veuillez sélectionner une intégration API dans la liste ci-dessous.',
        noIntegrations: 'Aucune intégration trouvée.',
        noIntegrationsDescription:
            "Vous n'avez pas configuré d'intégration dans cet environnement. Ajoutez votre première intégration dans le tableau de bord Nango.",
        connectTo: 'Se connecter à {provider}',
        error: 'Une erreur est survenue lors du chargement de la configuration'
    },
    go: {
        linkAccount: 'Lier le compte {provider}',
        connect: 'Connecter',
        success: 'Succès !',
        successMessage: 'Vous avez configuré avec succès votre intégration {provider}.',
        connectionFailed: 'Échec de la connexion',
        tryAgain: 'Veuillez réessayer',
        backToList: 'Retour à la liste des intégrations',
        willConnect: 'Nous allons vous connecter à {provider}',
        popupWarning: "Une fenêtre pop-up va s'ouvrir, veuillez vous assurer que votre navigateur ne bloque pas les pop-ups",
        popupBlocked: "La fenêtre d'authentification a été bloquée par votre navigateur, veuillez autoriser les pop-ups",
        popupClosed: "La fenêtre d'authentification a été fermée avant la fin du processus, veuillez réessayer",
        invalidCredentials: "{provider} n'a pas validé vos identifiants. Veuillez vérifier les valeurs et réessayer.",
        resourceCapped: "Vous avez atteint le nombre maximum de connexions autorisées. Veuillez contacter l'administrateur.",
        invalidPreconfigured: "Un champ préconfiguré par l'administrateur n'est pas valide, veuillez contacter le support"
    }
};

export default fr;
