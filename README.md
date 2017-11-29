# dat-gateway

A configurable [Dat](https://datproject.org/)-to-HTTP gateway, so you can visit Dat archives from your browser.

If you want a browser that can visit Dat archives, check out [Beaker](https://beakerbrowser.com/).

## Install

You can use dat-gateway as a library or a CLI.

With the library, you could add a gateway as a route to an existing application. With the CLI, you can run and configure a dedicated gateway.

To install as a library:

```
npm i -S dat-gateway
```

To install the CLI:

```
npm i -g dat-gateway
```

## Usage, Library

TODO

## Usage, CLI

Once you've installed dat-gateway, you will find the `dat-gateway` command on your $PATH. You can run this command to start a gateway server that listens on port 3000. You can also configure it:

- `-p, --port`: Specify which port to listen on. Defaults to 3000.
- `-t, --ttl`: Specify how many seconds Dat archives will remain in the cache. Defaults to 120. (TODO)
- `-d, --dir`: Specify a directory to use as a persistent cache. This will store Dat archives on disk rather than in memory. (TODO)

You can visit Dat archives through the gateway using a route like this:

```
http://localhost:3000/{datKey}/{path...}
```

For example:

```
http://localhost:3000/40a7f6b6147ae695bcbcff432f684c7bb5291ea339c28c1755896cdeb80bd2f9/assets/img/beaker-0.7.gif
```

## License

[GPL-3.0](https://opensource.org/licenses/gpl-3.0.html)
