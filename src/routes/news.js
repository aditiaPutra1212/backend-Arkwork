"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const p_limit_1 = __importDefault(require("p-limit"));
const preview_1 = require("../utils/preview");
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
    var _a, _b, _c, _d, _e;
    try {
        const limit = Math.min(Number((_a = req.query.limit) !== null && _a !== void 0 ? _a : 20), 50);
        const scope = String((_b = req.query.scope) !== null && _b !== void 0 ? _b : 'both'); // id | global | both
        const lang = String((_c = req.query.lang) !== null && _c !== void 0 ? _c : 'id');
        const country = String((_d = req.query.country) !== null && _d !== void 0 ? _d : 'ID');
        const customKeywords = ((_e = req.query.keywords) !== null && _e !== void 0 ? _e : '').toString().trim();
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
            var _a;
            try {
                const feed = await parser.parseURL(gnewsUrl(q, lang, country));
                return ((_a = feed.items) !== null && _a !== void 0 ? _a : []).map((it) => {
                    var _a, _b;
                    return ({
                        title: (_a = it.title) !== null && _a !== void 0 ? _a : '',
                        link: (_b = it.link) !== null && _b !== void 0 ? _b : '',
                        pubDate: it.pubDate ? new Date(it.pubDate).toISOString() : null,
                        source: it.source || it.creator || it.author || 'Google News'
                    });
                });
            }
            catch {
                return [];
            }
        }));
        const all = feeds.flat();
        // Deduplicate (normalize URL)
        const norm = (u) => (u !== null && u !== void 0 ? u : '').replace(/#.*$/, '');
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
        // Fetch og:image with limited concurrency
        const limitRun = (0, p_limit_1.default)(5);
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
