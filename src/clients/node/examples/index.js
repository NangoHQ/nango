const Pizzly = require('../dist') // require local build (similar to const Pizzly = require('pizzly-node'))

const pizzly = new Pizzly({ host: 'pizzly.example.org' })

console.log(pizzly.origin) // will be "https://pizzly.example.org/"
console.log(pizzly.key) // will "" (empty string)

const github = pizzly.integration('github')
const githubUser = github.auth('replace-with-a-valid-auth-id')

githubUser.get('/user')
githubUser.put('/user/starred/bearer/pizzly')

// API CALL -----------------------------------------------------------------------

const pizzly = new Pizzly({ host: 'example.org', secretKey: 'myKey' })
const apiClient = pizzly.api('google-drive')

// Manage configuration through API
await apiClient.get('configurations')
await apiClient.put('configurations/72184458-7751-41fe-8dcc-0251ab2cc578', {
  body: { credentials: { clientId: 'abcd***************', clientSecret: '1234***********************' } }
})
await apiClient.delete('configurations/72184458-7751-41fe-8dcc-0251ab2cc578')

// Manage Authentifications through API
await apiClient.get('authentifications')
await apiClient.post('authentifications/1994cc00-a4d6-11ea-9187-b798bad9d2ac/refresh')
await apiClient.delete('authentifications/1994cc00-a4d6-11ea-9187-b798bad9d2ac')
