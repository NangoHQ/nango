import winston from 'winston'
import expressWinston from 'express-winston'
const isDevelopment = process.env.NODE_ENV !== 'production'

const format = winston.format.combine(
  winston.format.colorize(),
  isDevelopment ? winston.format.simple() : winston.format.json()
)
const transports = [new winston.transports.Console()]
const meta = !isDevelopment
const msg = '{{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}'
const expressFormat = false

export const requestLogger = expressWinston.logger({
  transports,
  format,
  meta,
  msg,
  expressFormat,
  colorize: true // Color the text and status code, using the Express/morgan color palette (text: gray, status: default green, 3XX cyan, 4XX yellow, 5XX red).
})

export const errorLogger = expressWinston.errorLogger({
  transports,
  format,
  meta,
  msg
})
