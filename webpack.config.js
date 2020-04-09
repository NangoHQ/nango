const path = require('path')

module.exports = {
  entry: { index: './src/server.ts' },
  target: 'node',
  mode: 'production',
  optimization: {
    // We no not want to minimize our code.
    minimize: false
  },
  performance: {
    // Turn off size warnings for entry point
    hints: 'warning'
  },
  resolve: {
    extensions: ['.js', '.json', '.ts', '.tsx']
  },
  devtool: 'nosources-source-map',
  output: {
    libraryTarget: 'commonjs2',
    path: path.join(__dirname, 'dist'),
    filename: '[name].js',
    sourceMapFilename: '[file].map'
  },
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.build.json'
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  externals: {
    'simple-oauth2': true
  }
}
