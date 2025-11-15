"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPreviewImage = getPreviewImage;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
// Cache in-memory sederhana (TTL 6 jam)
const CACHE = new Map();
const TTL = 1000 * 60 * 60 * 6;
async function fetchHtml(url) {
    var _a, _b;
    const resp = await axios_1.default.get(url, {
        timeout: 9000,
        maxRedirects: 5,
        headers: {
            "User-Agent": "arkwork-energy-news/1.0 (+og-image)",
            Accept: "text/html,application/xhtml+xml",
        },
        validateStatus: (s) => s >= 200 && s < 400,
    });
    const finalUrl = ((_b = (_a = resp.request) === null || _a === void 0 ? void 0 : _a.res) === null || _b === void 0 ? void 0 : _b.responseUrl) || url;
    return { html: resp.data, finalUrl };
}
/** Jika halaman berasal dari news.google.com, cari URL media aslinya */
async function resolvePublisherUrlIfGoogle(url) {
    let u;
    try {
        u = new URL(url);
    }
    catch {
        return url;
    }
    if (u.hostname !== "news.google.com")
        return url;
    try {
        const { html, finalUrl } = await fetchHtml(url);
        const $ = cheerio.load(html);
        // 1) <link rel="canonical"> sering berisi URL publisher
        const canonical = $('link[rel="canonical"]').attr("href");
        if (canonical)
            return canonical;
        // 2) og:url
        const ogu = $('meta[property="og:url"]').attr("content");
        if (ogu)
            return ogu;
        // 3) Beberapa halaman punya <a ... href="?url=https://publisher.com/....">
        const aWithParam = $('a[href*="url="]').attr("href");
        if (aWithParam) {
            const href = new URL(aWithParam, finalUrl);
            const forwarded = href.searchParams.get("url");
            if (forwarded)
                return forwarded;
        }
        // 4) fallback: ambil link pertama yang keluar dari domain google (agak heuristik)
        const candidate = $('a[href^="http"]').toArray()
            .map((a) => $(a).attr("href"))
            .find((h) => {
            try {
                const hu = new URL(h, finalUrl);
                return hu.hostname !== "news.google.com" && hu.hostname !== "www.google.com";
            }
            catch {
                return false;
            }
        });
        if (candidate)
            return new URL(candidate, finalUrl).toString();
        return url;
    }
    catch {
        return url;
    }
}
async function getPreviewImage(pageUrl) {
    const now = Date.now();
    const cached = CACHE.get(pageUrl);
    if (cached && cached.exp > now)
        return cached.url;
    try {
        // Normalisasi: kalau link dari Google News, resolve ke publisher dulu
        const resolvedUrl = await resolvePublisherUrlIfGoogle(pageUrl);
        const { html, finalUrl } = await fetchHtml(resolvedUrl);
        const $ = cheerio.load(html);
        const candidates = [
            $('meta[property="og:image:secure_url"]').attr("content"),
            $('meta[property="og:image"]').attr("content"),
            $('meta[name="og:image"]').attr("content"),
            $('meta[name="twitter:image"]').attr("content"),
            $('link[rel="image_src"]').attr("href"),
        ].filter(Boolean);
        let img = candidates[0] || null;
        // Normalisasi ke absolute URL
        if (img && !/^https?:\/\//i.test(img)) {
            const base = new URL(finalUrl);
            img = new URL(img, base).toString();
        }
        CACHE.set(pageUrl, { url: img, exp: now + TTL });
        return img;
    }
    catch {
        CACHE.set(pageUrl, { url: null, exp: now + TTL });
        return null;
    }
}
