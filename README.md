# Dat HTTP Gateway

A quick, configurable [Dat](https://datproject.org/) to HTTP gateway. Stores archives on disk or in memory. Exposes Dat archives along this URL structure:

```
PROTOCOL://HOSTNAME:PORT/{datKey}/{path...}
```

For example:

```
http://localhost:3000/40a7f6b6147ae695bcbcff432f684c7bb5291ea339c28c1755896cdeb80bd2f9/assets/img/beaker-0.7.gif
```

That should link you to the branding image for [Beaker Browser](https://beakerbrowser.com/) v0.7.

## Install

Get the repo using Git and NPM:

```bash
git clone garbados/dat-gateway
cd dat-gateway
npm install
```

## Usage

To start the server with default settings, run this:

```bash
npm start
```

That will start the gateway and bind it to `http://localhost:3000/`.

You can also add a `dat-gateway` command to your $PATH like this:

```bash
npm link
```

## Configuration

TODO

## Deployment

TODO

## Testing

To run the test suite, run this:

```bash
npm test
```

## License

GPL-3.0, see [LICENSE](./LICENSE).
