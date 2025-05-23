const es = {
    common: {
        close: 'Cerrar',
        loading: 'Cargando',
        back: 'Atrás',
        finish: 'Finalizar',
        tryAgain: 'Intentar de nuevo',
        connecting: 'Conectando...',
        connect: 'Conectar',
        viewGuide: 'Ver guía de conexión',
        needHelp: '¿Necesitas ayuda?'
    },
    integrationsList: {
        title: 'Seleccionar Integración',
        description: 'Por favor, selecciona una integración de API de la lista a continuación.',
        noIntegrations: 'No se encontró ninguna integración.',
        connectTo: 'Conectar a {provider}',
        error: 'Ocurrió un error al cargar la configuración'
    },
    go: {
        linkAccount: 'Vincular cuenta de {provider}',
        connect: 'Conectar',
        success: '¡Éxito!',
        successMessage: 'Has configurado exitosamente tu integración con {provider}',
        connectionFailed: 'Conexión fallida',
        tryAgain: 'Por favor, inténtalo de nuevo',
        backToList: 'Volver a la lista de integraciones',
        willConnect: 'Te conectaremos a {provider}',
        popupWarning: 'Se abrirá una ventana emergente, asegúrate de que tu navegador no bloquee las ventanas emergentes',
        popupBlocked: 'Ventana emergente de autenticación bloqueada por tu navegador, por favor permite las ventanas emergentes',
        popupClosed: 'La ventana emergente de autenticación se cerró antes del final del proceso, por favor inténtalo de nuevo',
        invalidCredentials: '{provider} no validó tus credenciales. Por favor verifica los valores e inténtalo de nuevo.',
        resourceCapped: 'Has alcanzado el número máximo de conexiones permitidas. Por favor contacta al administrador.',
        invalidPreconfigured: 'Un campo preconfigurado establecido por el administrador es inválido, por favor contacta al soporte'
    }
};

export default es;
export type Translation = typeof es;
