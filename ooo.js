// lan.js — HTTP/2 клиент с Firefox TLS + Firefox SETTINGS (антидетект-friendly)
// Модифицировано для байпаса Cloudflare Bot Fight Mode (UAM/IUAM) через Playwright (headless Firefox)

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
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: FIREFOX_UA,
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US'
  });

  const page = await context.newPage();

  try {
    await page.goto(`https://${host}${path}`, { waitUntil: 'networkidle' });
    
    // Ждём разрешения челленджа (изменение title или отсутствие "Just a moment...")
    await Promise.race([
      page.waitForFunction(() => document.title !== "Just a moment..." && !document.body.innerText.includes("Just a moment..."), { timeout: 30000 }),
      page.waitForTimeout(10000) // Fallback timeout
    ]);

    // Получаем куки
    const pwCookies = await context.cookies();
    const clearanceCookies = {};
    for (const ck of pwCookies) {
      clearanceCookies[ck.name] = ck.value;
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

    rejectUnauthorized: false,
  };

  return tls.connect(tlsOpts);
}

// -----------------------------------------------------------
// Общие HTTP/2 заголовки (Firefox-like)
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
async function sendHttp2Request(path, method = "GET", body = null) {
  const isChallenge = path.includes("/cdn-cgi/challenge-platform");
  console.log(`[⚡] ${method} → ${TARGET_HOST}${path}${isChallenge ? " (challenge)" : ""}`);

  // Если есть челлендж, используем Playwright для получения куки
  if (Object.keys(cookies).length === 0 || !cookies.cf_clearance) {
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

    if (!isChallenge) {
      console.log("\n--- REQUEST HEADERS ---");
      for (const k in headers) console.log(`${k}: ${headers[k]}`);

      console.log("\n--- RESPONSE HEADERS ---");
      for (const k in hdrs) console.log(`${k}: ${hdrs[k]}`);

      console.log("------------------------");
    }
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
    // Если всё ещё челлендж, retry с новыми куки
    if ((status === 403 || status === 503) && (html.includes("cf-browser-verification") || html.includes("Just a moment..."))) {
      console.log(`[⚡] Обнаружен Cloudflare челлендж (статус ${status}), повтор с Playwright...`);
      try { client.close(); } catch {}
      // Рекурсивный вызов для retry
      setTimeout(() => sendHttp2Request(path, method, body), 2000);
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

  req.setTimeout(12000, () => {
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