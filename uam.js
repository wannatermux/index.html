// lan.js — HTTP/2 клиент с Firefox TLS + Firefox SETTINGS (антидетект-friendly)
// Модифицировано для байпаса Cloudflare Bot Fight Mode (UAM/IUAM) через Playwright (headless Firefox)
// Улучшено TLS fingerprint для Firefox-like

const tls = require("tls");
const http2 = require("http2");
const zlib = require("zlib");
const { URL } = require("url");
const { firefox } = require("playwright"); // npm install playwright

// -----------------------------------------------------------
// Cookies для персистентности
let cookies = {};

// Функция парсинга Set-Cookie
function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  if (!Array.isArray(setCookieHeaders)) setCookieHeaders = [setCookieHeaders];
  for (let cookieStr of setCookieHeaders) {
    const eqIdx = cookieStr.indexOf('=');
    if (eqIdx === -1) continue;
    const semiIdx = cookieStr.indexOf(';', eqIdx);
    const name = cookieStr.substring(0, eqIdx).trim();
    const value = cookieStr.substring(eqIdx + 1, semiIdx !== -1 ? semiIdx : undefined).trim();
    if (name && value) {
      cookies[name] = value;
    }
  }
}

// -----------------------------------------------------------
// Получение cf_clearance куки через Playwright (решает JS челлендж)
async function getClearanceCookies(host, path) {
  console.log(`[⚡] Запуск Playwright для решения челленджа...`);
  const browser = await firefox.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-background-networking',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--safebrowsing-disable-auto-update',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--disable-domain-reliability',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-print-preview',
      '--disable-speech-api',
      '--enable-logging=stderr',
      '--v=1'
    ]
  });

  const context = await browser.newContext({
    userAgent: FIREFOX_UA,
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
    permissions: ['geolocation']
  });

  // Добавляем stealth для обхода детекции headless
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    const originalQuery = window.navigator.permissions.query;
    return window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  const page = await context.newPage();

  try {
    await page.goto(`https://${host}${path}`, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Ждём разрешения челленджа (изменение title или отсутствие "Just a moment...")
    try {
      await page.waitForFunction(() => 
        document.title !== "Just a moment..." && 
        !document.body.innerText.includes("Just a moment...") &&
        !document.querySelector('iframe[src*="turnstile"]'), 
        { timeout: 30000 }
      );
    } catch (e) {
      console.log(`[⚠] Таймаут ожидания челленджа: ${e.message}`);
    }

    // Получаем куки
    const pwCookies = await context.cookies();
    const clearanceCookies = {};
    for (const ck of pwCookies) {
      if (ck.domain.includes(host)) {
        clearanceCookies[ck.name] = ck.value;
      }
    }

    console.log(`[⚡] Получены куки: ${Object.keys(clearanceCookies).join(', ')}`);

    // Обновляем глобальные куки
    Object.assign(cookies, clearanceCookies);

    return clearanceCookies;
  } catch (e) {
    console.error(`[⚠] Ошибка Playwright: ${e.message}`);
    return {};
  } finally {
    await browser.close();
  }
}

// -----------------------------------------------------------
// URL
let targetArg = process.argv[2];
if (!targetArg) {
  const defaultUrl = "https://www.google.com/";
  console.log(`[⚡] URL не указан — используем: ${defaultUrl}`);
  targetArg = defaultUrl;
}

let parsedUrl;
try {
  parsedUrl = new URL(targetArg);
} catch (e) {
  console.error(`[⚡] Неверный URL: ${targetArg}`);
  process.exit(1);
}

const TARGET_HOST = parsedUrl.hostname;
const TARGET_PATH = parsedUrl.pathname + parsedUrl.search;

// -----------------------------------------------------------
// Firefox User-Agent
const FIREFOX_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0";

// -----------------------------------------------------------
// Real Firefox HTTP/2 SETTINGS
const FIREFOX_HTTP2_SETTINGS = {
  headerTableSize: 65536,
  maxConcurrentStreams: 1000,
  initialWindowSize: 6291456,
  maxFrameSize: 16384,
  maxHeaderListSize: 262144
};

const TLS_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_CHACHA20_POLY1305_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
  "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
  "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
  "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
  "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
  "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
  "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
  "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA",
  "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
  "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
  "TLS_RSA_WITH_AES_128_GCM_SHA256",
  "TLS_RSA_WITH_AES_256_GCM_SHA384",
  "TLS_RSA_WITH_AES_128_CBC_SHA",
  "TLS_RSA_WITH_AES_256_CBC_SHA"
];

const cipher = TLS_CIPHERS.join(':');

const TLS_SIGNATURE_ALGORITHMS = [
  "ecdsa_secp256r1_sha256",
  "ecdsa_secp384r1_sha384",
  "ecdsa_secp521r1_sha512",
  "rsa_pss_rsae_sha256",
  "rsa_pss_rsae_sha384",
  "rsa_pss_rsae_sha512",
  "rsa_pkcs1_sha256",
  "rsa_pkcs1_sha384",
  "rsa_pkcs1_sha512",
];

const sigalg = TLS_SIGNATURE_ALGORITHMS.join(":");

// -----------------------------------------------------------
// TLS ClientHello (приближено к Firefox)
function createTlsSocket(host) {
  const tlsOpts = {
    host,
    port: 443,
    servername: host,

    ALPNProtocols: ["h2", "http/1.1"],

    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",

    ciphers: cipher,

    ecdhCurve: "X25519:secp256r1:secp384r1",

    sigalgs: sigalg,

    honorCipherOrder: true,
    rejectUnauthorized: false,
    timeout: 10000
  };

  return tls.connect(tlsOpts);
}

// -----------------------------------------------------------
// Общие HTTP/2 заголовки (Firefox-like)
// Не добавляем Sec-CH-* , так как Firefox их не отправляет
function getBaseHeaders(path, method = "GET") {
  const baseHeaders = {
    ":method": method,
    ":path": path,
    ":authority": TARGET_HOST,
    ":scheme": "https",

    "user-agent": FIREFOX_UA,

    "accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.5",
    "accept-encoding": "gzip, deflate, br",

    // Sec-CH-UA-Platform: '"Windows"' , // Не добавляем, Firefox не отправляет
  };

  // Добавляем куки если есть
  if (Object.keys(cookies).length > 0) {
    baseHeaders.cookie = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  return baseHeaders;
}

// -----------------------------------------------------------
// Функция отправки запроса (GET по умолчанию)
async function sendHttp2Request(path, method = "GET", body = null, retryCount = 0) {
  const maxRetries = 2;
  const isChallenge = path.includes("/cdn-cgi/challenge-platform") || retryCount > 0;

  console.log(`[⚡] ${method} → ${TARGET_HOST}${path} (retry ${retryCount}/${maxRetries})`);

  // Если нет cf_clearance, получаем через Playwright
  if (!cookies.cf_clearance && retryCount < maxRetries) {
    await getClearanceCookies(TARGET_HOST, TARGET_PATH);
  }

  const client = http2.connect(`https://${TARGET_HOST}`, {
    createConnection: () => createTlsSocket(TARGET_HOST),
    settings: FIREFOX_HTTP2_SETTINGS
  });

  // debug TLS
  client.on("connect", () => {
    const s = client.socket;
    if (s) {
      console.log(`[⚡] ALPN: ${s.alpnProtocol}`);
      try {
        const c = s.getCipher();
        if (c) console.log(`[⚡] Cipher: ${c.name}`);
      } catch {}
    }
  });

  client.on("error", err => {
    console.error(`[⚠] Client error: ${err?.message || err}`);
    try { client.close(); } catch {}
  });

  // ---------------------------------------------------------
  const headers = getBaseHeaders(path, method);

  const req = client.request(headers, { endStream: !body });

  if (body) {
    req.write(body);
    req.end();
  }

  req.on("error", err => {
    console.error(`[⚠] Stream error: ${err?.message || err}`);
    try { req.close(); } catch {}
    try { client.close(); } catch {}
  });

  // ---------------------------------------------------------
  let responseHeaders = {};
  let chunks = [];
  let gotHeaders = false;

  req.on("response", hdrs => {
    gotHeaders = true;
    responseHeaders = hdrs;

    // Парсим куки
    parseCookies(hdrs["set-cookie"]);

    console.log("\n--- REQUEST HEADERS ---");
    for (const k in headers) console.log(`${k}: ${headers[k]}`);

    console.log("\n--- RESPONSE HEADERS ---");
    for (const k in hdrs) console.log(`${k}: ${hdrs[k]}`);

    console.log("------------------------");
  });

  req.on("data", chunk => chunks.push(chunk));

  req.on("end", () => {
    if (!gotHeaders) {
      console.log("[⚠] Сервер закрыл соединение без response headers");
      try { client.close(); } catch {}
      return;
    }

    let raw = Buffer.concat(chunks);
    let buf = raw;

    try {
      const enc = responseHeaders["content-encoding"] || "";
      if (enc.includes("gzip")) buf = zlib.gunzipSync(raw);
      else if (enc.includes("deflate")) buf = zlib.inflateSync(raw);
      else if (enc.includes("br")) buf = zlib.brotliDecompressSync(raw);
    } catch (e) {
      console.error("[⚠] Ошибка декомпрессии:", e?.message || e);
    }

    const html = buf.toString("utf8");
    const status = responseHeaders[":status"] || responseHeaders.status || 200;

    // -------------------------------------------------------
    // Если всё ещё челлендж, retry
    if ((status === 403 || status === 503) && (html.includes("cf-browser-verification") || html.includes("Just a moment..."))) {
      console.log(`[⚡] Обнаружен Cloudflare челлендж (статус ${status}), повтор...`);
      try { client.close(); } catch {}
      if (retryCount < maxRetries) {
        setTimeout(() => sendHttp2Request(path, method, body, retryCount + 1), 2000);
      } else {
        console.log("[⚠] Максимум ретраев достигнут");
      }
      return;
    }

    // -------------------------------------------------------
    // Обычный успешный ответ
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "нет <title>";

    console.log(`\n[⚡] Title: ${title}`);
    console.log(`[⚡] Size: ${buf.length} bytes\n`);

    try { client.close(); } catch {}
  });

  req.setTimeout(15000, () => {
    console.log("[⚠] Таймаут запроса");
    try { req.close(); } catch {}
    try { client.close(); } catch {}
  });
}

// -----------------------------------------------------------
// MAIN REQUEST (async)
async function sendRequest(host, path) {
  await sendHttp2Request(path);
}

sendRequest(TARGET_HOST, TARGET_PATH);