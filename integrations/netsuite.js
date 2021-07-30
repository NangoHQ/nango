module.exports = {
  netsuite: (account_url_id, client_id) => {
    return {
            "name": "Netsuite",
              "auth": {
                "authorizationURL": `https://${account_url_id}.app.netsuite.com/app/login/oauth2/authorize.nl`,
                "tokenURL": `https://${account_url_id}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`,
                "authType": "OAUTH2",
                "tokenParams": {},
                "authorizationParams": {
                  "client_id": `${client_id}`,
                  "grant_type": "authorization_code",
                  "state": "{st=state123abc,ds=123456789}",
                  "scope": "restlets rest_webservice"
                },
                "auth": { "response_type": "code" }
              },
          "request": {
            "baseURL": `https://${account_url_id}.suitetalk.api.netsuite.com/services/rest/record/v1`,
            "headers": {
              "Accept": "application/json",
              "Authorization": "Bearer ${auth.accessToken}",
              "User-Agent": "Pizzly"
            }
          }
      }
  }
}
