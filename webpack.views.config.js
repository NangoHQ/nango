const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')

const mode = 'production'
const distPath = path.join(__dirname, '.webpack', 'service', 'views')
const srcViews = path.join(__dirname, 'src/views')
const stage = process.env.STAGE

if (!stage) {
  throw new Error('Missing stage')
}

module.exports = [
  {
    // unfortunately I can not name js dan html the same way. That's why I added script suffix
    entry: path.join(srcViews, 'iframe-script.ts'),
    output: {
      filename: 'iframe-script.js?[hash]',
      path: distPath
    },
    mode,
    plugins: [
      new HtmlWebpackPlugin({
        template: 'src/views/iframe.html',
        filename: 'iframe.html'
      }),
      new ScriptExtHtmlWebpackPlugin({
        inline: 'iframe-script'
      })
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts(x?)$/,
          exclude: path.resolve(__dirname, 'node_modules'),
          use: [
            {
              loader: 'ts-loader'
            }
          ]
        }
      ]
    }
  },
  {
    // unfortunately I can not name js dan html the same way. That's why I added script suffix
    entry: path.join(srcViews, 'error-script.ts'),
    output: {
      filename: 'error-script.js?[hash]',
      path: distPath
    },
    mode,
    plugins: [
      new HtmlWebpackPlugin({
        template: 'src/views/page-not-found-error.mustache',
        filename: 'page-not-found-error.mustache'
      }),
      new HtmlWebpackPlugin({
        template: 'src/views/callback-url-request-error.mustache',
        filename: 'callback-url-request-error.mustache'
      }),
      new HtmlWebpackPlugin({
        template: 'src/views/oauth-error.mustache',
        filename: 'oauth-error.mustache'
      }),
      new ScriptExtHtmlWebpackPlugin({
        inline: 'error-script'
      })
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts(x?)$/,
          exclude: path.resolve(__dirname, 'node_modules'),
          use: [
            {
              loader: 'ts-loader'
            }
          ]
        }
      ]
    }
  },
  {
    // unfortunately I can not name js dan html the same way. That's why I added script suffix
    entry: path.join(srcViews, 'callback-script.ts'),
    output: {
      filename: 'callback-script.js?[hash]',
      path: distPath
    },
    mode,
    plugins: [
      new HtmlWebpackPlugin({
        template: 'src/views/callback.mustache',
        filename: 'callback.mustache'
      }),
      new ScriptExtHtmlWebpackPlugin({
        inline: 'callback-script'
      }),
      new CopyPlugin([
        {
          from: 'src/views/callback-local.mustache',
          to: distPath
        }
      ])
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts(x?)$/,
          exclude: path.resolve(__dirname, 'node_modules'),
          use: [
            {
              loader: 'ts-loader'
            }
          ]
        }
      ]
    }
  }
]
