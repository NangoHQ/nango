import * as express from 'express'
const auth = express.Router()

auth.all('*', handler)

function handler(req, res) {
  res.send('[AUTH] It works!')
}

export { auth }
