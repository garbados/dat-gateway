# dat-gateway

[![Stability](https://img.shields.io/badge/stability-experimental-orange.svg)](https://nodejs.org/api/documentation.html#documentation_stability_index)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![Build Status](https://travis-ci.org/garbados/dat-gateway.svg?branch=master)](https://travis-ci.org/garbados/dat-gateway)

A configurable in-memory [Dat](https://datproject.org/)-to-HTTP gateway, so you can visit Dat archives from your browser.

If you want a browser that can visit Dat archives, check out [Beaker](https://beakerbrowser.com/).

## Install

To get the `dat-gateway` command for running your own gateway, use [npm](https://www.npmjs.com/):

```
npm i -g dat-gateway
```

## Usage

You can run `dat-gateway` to start a gateway server that listens on port 3000. You can also configure it:

- `-p, --port`: Specify which port to listen on. Defaults to 3000.
- `-d, --dir`: Specify a directory to use as a cache. Defaults to `~/.dat-gateway`.

You can visit Dat archives through the gateway using a route like this:

```
http://localhost:3000/{datKey}/{path...}
```

For example:

```
http://localhost:3000/40a7f6b6147ae695bcbcff432f684c7bb5291ea339c28c1755896cdeb80bd2f9/assets/img/beaker-0.7.gif
```

The gateway will even resolve URLs using [Dat-DNS](https://github.com/beakerbrowser/beaker/wiki/Authenticated-Dat-URLs-and-HTTPS-to-Dat-Discovery):

```
http://localhost:3000/garbados.hashbase.io/icons/favicon.ico
```

## Contributions

All contributions are welcome: bug reports, feature requests, "why doesn't this work" questions, patches for fixes and features, etc. For all of the above, [file an issue](https://github.com/garbados/dat-gateway/issues) or [submit a pull request](https://github.com/garbados/dat-gateway/pulls).

## License

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
