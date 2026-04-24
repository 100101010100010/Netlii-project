/* --- LIFECYCLE MANAGEMENT --- */
// Forces the Service Worker to activate immediately without waiting for old workers to close.
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

// Ensures the Service Worker takes control of all open pages immediately upon activation.
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

/* --- CONFIGURATION & IMPORTS --- */
const ADBLOCK = {
    blocked: [
  "googlevideo.com/videoplayback",
  "youtube.com/get_video_info",
  "youtube.com/api/stats/ads",
  "youtube.com/pagead",
  "youtube.com/api/stats",
  "youtube.com/get_midroll",
  "youtube.com/ptracking",
  "youtube.com/youtubei/v1/player",
  "youtube.com/s/player",
  "youtube.com/api/timedtext",
  "facebook.com/ads",
  "facebook.com/tr",
  "fbcdn.net/ads",
  "graph.facebook.com/ads",
  "graph.facebook.com/pixel",
  "ads-api.twitter.com",
  "analytics.twitter.com",
  "twitter.com/i/ads",
  "ads.yahoo.com",
  "advertising.com",
  "adtechus.com",
  "amazon-adsystem.com",
  "adnxs.com",
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "rubiconproject.com",
  "pubmatic.com",
  "criteo.com",
  "openx.net",
  "taboola.com",
  "outbrain.com",
  "moatads.com",
  "casalemedia.com",
  "unityads.unity3d.com",
  "/ads/",
  "/adserver/",
  "/banner/",
  "/promo/",
  "/tracking/",
  "/beacon/",
  "/metrics/",
  "adsafeprotected.com",
  "chartbeat.com",
  "scorecardresearch.com",
  "quantserve.com",
  "krxd.net",
  "demdex.net"
]   
};


function isAdBlocked(url) {
    const urlStr = url.toString();
    return ADBLOCK.blocked.some(pattern => {
        let regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i');
        return regex.test(urlStr);
    });
}

const swPath = self.location.pathname;
const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);
self.basePath = self.basePath || basePath;

// Scramjet and BareMux Setup
self.$scramjet = {
    files: {
        wasm: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.wasm.wasm",
        sync: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.sync.js",
    }
};

importScripts("https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.all.js");
importScripts("https://cdn.jsdelivr.net/npm/@mercuryworkshop/bare-mux/dist/index.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker({ prefix: basePath + "scramjet/" });

/* --- WISP & MESSAGING LOGIC --- */
let wispConfig = { wispurl: null, servers: [], autoswitch: true };
let resolveConfigReady;
const configReadyPromise = new Promise(resolve => resolveConfigReady = resolve);

self.addEventListener("message", ({ data }) => {
    if (data.type === "config") {
        if (data.wispurl) {
            wispConfig.wispurl = data.wispurl;
            if (resolveConfigReady) {
                resolveConfigReady();
                resolveConfigReady = null;
            }
        }
    }
});

/* --- FETCH INTERCEPTION --- */
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // CRITICAL: Bypass the proxy for its own setup files and CDNs to prevent "Invalid State" crashes.
    if (
        url.pathname.includes('sw.js') || 
        url.pathname.includes('bareworker.js') || 
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.pathname.endsWith('.wasm')
    ) {
        return; 
    }

    event.respondWith((async () => {
        if (isAdBlocked(event.request.url)) {
            return new Response(null, { status: 204 });
        }

        try {
            await scramjet.loadConfig();
            if (scramjet.route(event)) {
                return await scramjet.fetch(event);
            }
        } catch (err) {
            console.error("Scramjet Route Error:", err);
        }
        
        return fetch(event.request);
    })());
});

/* --- SCRAMJET REQUEST HANDLER --- */
scramjet.addEventListener("request", async (e) => {
    e.response = (async () => {
        await configReadyPromise; // Wait until home.html sends the Wisp URL
        
        if (!scramjet.client) {
            const connection = new BareMux.BareMuxConnection(basePath + "bareworker.js");
            await connection.setTransport("https://cdn.jsdelivr.net/npm/@mercuryworkshop/epoxy-transport@2.1.28/dist/index.mjs", [{ wisp: wispConfig.wispurl }]);
            scramjet.client = connection;
        }

        return await scramjet.client.fetch(e.url, {
            method: e.method,
            body: e.body,
            headers: e.requestHeaders,
            credentials: "include",
            redirect: "manual",
        });
    })();
});
