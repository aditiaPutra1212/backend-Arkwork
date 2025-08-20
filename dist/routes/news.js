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
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const preview_1 = require("../utils/preview");
// ❌ HAPUS import ESM langsung:
// import pLimit from 'p-limit'
// ✅ Ganti dengan helper dynamic import (jalan di CommonJS)
async function getLimiter(concurrency) {
    const mod = await Promise.resolve().then(() => __importStar(require('p-limit')));
    return mod.default(concurrency);
}
const router = (0, express_1.Router)();
// Rate limit
const limiter = (0, express_rate_limit_1.default)({ windowMs: 60 * 1000, max: 60 });
router.use(limiter);
// RSS Parser
const parser = new rss_parser_1.default({ headers: { 'User-Agent': 'arkwork-energy-news/1.0' } });
// Helper: Google News RSS URL
function gnewsUrl(query, lang = 'id', country = 'ID') {
    const base = 'https://news.google.com/rss/search';
    const p = new URLSearchParams({ q: query, hl: lang, gl: country, ceid: `${country}:${lang}` });
    return `${base}?${p.toString()}`;
}
const ID_QUERIES = [
    '(migas OR minyak OR gas OR energi) site:esdm.go.id',
    '(migas OR minyak OR gas OR energi) site:katadata.co.id',
    '(migas OR minyak OR gas OR energi) site:cnbcindonesia.com',
    '(migas OR minyak OR gas OR energi) site:bisnis.com',
    '(migas OR minyak OR gas OR energi) site:cnnindonesia.com'
];
const GLOBAL_QUERIES = [
    '(oil OR gas OR LNG OR energy) site:reuters.com',
    '(oil OR gas OR LNG OR energy) site:aljazeera.com',
    '(oil OR gas OR LNG OR energy) site:bloomberg.com',
    '(oil OR gas OR LNG OR energy) site:ft.com',
    '(oil OR gas OR LNG OR energy) site:wsj.com'
];
// Root info (opsional)
router.get('/', (_req, res) => {
    res.json({
        ok: true,
        usage: '/api/news/energy?scope=id|global|both&limit=20&lang=id|en&country=ID|US&keywords=...'
    });
});
router.get('/energy', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit ?? 20), 50);
        const scope = String(req.query.scope ?? 'both'); // id | global | both
        const lang = String(req.query.lang ?? 'id');
        const country = String(req.query.country ?? 'ID');
        const customKeywords = (req.query.keywords ?? '').toString().trim();
        let queries = [];
        if (scope === 'id')
            queries = ID_QUERIES;
        else if (scope === 'global')
            queries = GLOBAL_QUERIES;
        else
            queries = [...ID_QUERIES, ...GLOBAL_QUERIES];
        if (customKeywords) {
            queries = queries.map(() => customKeywords);
        }
        // fetch feeds with per-query try/catch
        const feeds = await Promise.all(queries.map(async (q) => {
            try {
                const feed = await parser.parseURL(gnewsUrl(q, lang, country));
                return (feed.items ?? []).map((it) => ({
                    title: it.title ?? '',
                    link: it.link ?? '',
                    pubDate: it.pubDate ? new Date(it.pubDate).toISOString() : null,
                    source: it.source || it.creator || it.author || 'Google News'
                }));
            }
            catch {
                return [];
            }
        }));
        const all = feeds.flat();
        // Deduplicate (normalize URL)
        const norm = (u) => (u ?? '').replace(/#.*$/, '');
        const seen = new Set();
        const deduped = all.filter((a) => {
            const key = norm(a.link) || a.title;
            if (!key || seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        // Sort by date desc
        deduped.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
        // Fetch og:image with limited concurrency (pakai dynamic import)
        const limitRun = await getLimiter(5);
        const withImages = await Promise.all(deduped.slice(0, limit).map((item) => limitRun(async () => {
            const image = item.link ? await (0, preview_1.getPreviewImage)(item.link) : null;
            return { ...item, image };
        })));
        res.json({ scope, lang, country, count: withImages.length, items: withImages });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});
exports.default = router;
