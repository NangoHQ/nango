import * as express from 'express'
const proxy = express.Router()

proxy.all('*', handler)

function handler(req, res) {
  res.send('[PROXY] It works!')
}

export { proxy }
