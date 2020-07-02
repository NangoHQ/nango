const Pizzly = require('../dist') // require local build (similar to const Pizzly = require('pizzly-node'))

const pizzly = new Pizzly({ host: 'pizzly.example.org' })

console.log(pizzly.origin) // will be "https://pizzly.example.org/"
console.log(pizzly.key) // will "" (empty string)

const github = pizzly.integration('github')
const githubUser = github.auth('replace-with-a-valid-auth-id')

githubUser.get('/user')
githubUser.put('/user/starred/bearer/pizzly')
