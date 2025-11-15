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
/** ================= Rate limit ================= */
const limiter = (0, express_rate_limit_1.default)({ windowMs: 60 * 1000, max: 60 });
router.use(limiter);
/** ================= RSS Parser ================= */
const parser = new rss_parser_1.default({
    headers: { 'User-Agent': 'arkwork-energy-news/2.0 (+https://arkwork.example)' },
    timeout: 15000,
});
/** ================= Google News helper =================
 * q: kata kunci (boleh mengandung operator Google News, mis: when:7d)
 * hl: language UI, gl: negara, ceid: pair country:lang
 */
function gnewsUrl(query, lang = 'en', country = 'US') {
    const base = 'https://news.google.com/rss/search';
    const p = new URLSearchParams({ q: query, hl: lang, gl: country, ceid: `${country}:${lang}` });
    return `${base}?${p.toString()}`;
}
/** ================= CEID presets (lintas negara) =================
 * Pilihan populer lintas region. Tambahkan/ubah sesuai kebutuhan.
 * (Google News butuh pasangan gl/lang yang valid)
 */
const CEIDS_ALL = [
    { gl: 'US', hl: 'en' }, // North America
    { gl: 'CA', hl: 'en' },
    { gl: 'GB', hl: 'en' }, // Europe
    { gl: 'IE', hl: 'en' },
    { gl: 'DE', hl: 'de' },
    { gl: 'FR', hl: 'fr' },
    { gl: 'ES', hl: 'es' },
    { gl: 'IT', hl: 'it' },
    { gl: 'NL', hl: 'nl' },
    { gl: 'SE', hl: 'sv' },
    { gl: 'NO', hl: 'no' },
    { gl: 'PL', hl: 'pl' },
    { gl: 'RU', hl: 'ru' },
    { gl: 'TR', hl: 'tr' },
    { gl: 'AE', hl: 'ar' }, // Middle East
    { gl: 'SA', hl: 'ar' },
    { gl: 'QA', hl: 'ar' },
    { gl: 'EG', hl: 'ar' },
    { gl: 'ZA', hl: 'en' }, // Africa
    { gl: 'NG', hl: 'en' },
    { gl: 'IN', hl: 'en' }, // Asia
    { gl: 'ID', hl: 'id' },
    { gl: 'SG', hl: 'en' },
    { gl: 'MY', hl: 'ms' },
    { gl: 'PH', hl: 'en' },
    { gl: 'VN', hl: 'vi' },
    { gl: 'TH', hl: 'th' },
    { gl: 'JP', hl: 'ja' },
    { gl: 'KR', hl: 'ko' },
    { gl: 'CN', hl: 'zh-CN' },
    { gl: 'TW', hl: 'zh-TW' },
    { gl: 'AU', hl: 'en' }, // Oceania
    { gl: 'NZ', hl: 'en' },
    { gl: 'BR', hl: 'pt-BR' }, // LatAm
    { gl: 'MX', hl: 'es-419' },
    { gl: 'AR', hl: 'es-419' },
    { gl: 'CL', hl: 'es-419' },
];
/** ================= Queries preset ================= */
const ID_QUERIES = [
    '(migas OR minyak OR gas OR energi) site:esdm.go.id',
    '(migas OR minyak OR gas OR energi) site:katadata.co.id',
    '(migas OR minyak OR gas OR energi) site:cnbcindonesia.com',
    '(migas OR minyak OR gas OR energi) site:bisnis.com',
    '(migas OR minyak OR gas OR energi) site:cnnindonesia.com',
];
const GLOBAL_QUERIES = [
    '(oil OR gas OR LNG OR energy) site:reuters.com',
    '(oil OR gas OR LNG OR energy) site:bloomberg.com',
    '(oil OR gas OR LNG OR energy) site:ft.com',
    '(oil OR gas OR LNG OR energy) site:wsj.com',
    '(oil OR gas OR LNG OR energy) site:aljazeera.com',
];
/** Query default khusus O&G lintas negara (tanpa site:) */
const OIL_GAS_GLOBAL_DEFAULT = '(oil OR gas OR LNG OR petroleum OR refinery OR upstream OR downstream)';
/** ================= Root (opsional) ================= */
router.get('/', (_req, res) => {
    res.json({
        ok: true,
        usage: '/api/news/energy?scope=id|global|both&limit=20&lang=id|en&country=ID|US|ALL&when=14d&keywords=...',
        tip: 'Gunakan country=ALL untuk lintas negara. Gunakan when=7d/30d/48h agar lebih relevan.',
    });
});
/** ================= /energy ================= */
router.get('/energy', async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
    try {
        const limit = Math.min(Number((_a = req.query.limit) !== null && _a !== void 0 ? _a : 20), 100);
        const scope = String((_b = req.query.scope) !== null && _b !== void 0 ? _b : 'both'); // id | global | both
        const lang = String((_c = req.query.lang) !== null && _c !== void 0 ? _c : 'id');
        const country = String((_d = req.query.country) !== null && _d !== void 0 ? _d : 'ID'); // ISO 2, atau "ALL"
        const when = String((_e = req.query.when) !== null && _e !== void 0 ? _e : '14d').trim(); // Google News supports when:7d, 48h, etc.
        const customKeywords = ((_f = req.query.keywords) !== null && _f !== void 0 ? _f : '').toString().trim();
        /** 1) Tentukan daftar query */
        let queries = [];
        if (customKeywords) {
            // pakai custom, otomatis tambahkan when:.. jika belum ada
            const qHasWhen = /when:\s*\d+(?:h|d)/i.test(customKeywords);
            const qFinal = qHasWhen ? customKeywords : `${customKeywords} when:${when}`;
            queries = [qFinal];
        }
        else {
            if (country.toUpperCase() === 'ALL') {
                // lintas negara: pakai query global generik (tanpa site:)
                queries = [`${OIL_GAS_GLOBAL_DEFAULT} when:${when}`];
            }
            else {
                // sesuai scope lama
                if (scope === 'id')
                    queries = ID_QUERIES.map((q) => `${q} when:${when}`);
                else if (scope === 'global')
                    queries = GLOBAL_QUERIES.map((q) => `${q} when:${when}`);
                else
                    queries = [...ID_QUERIES, ...GLOBAL_QUERIES].map((q) => `${q} when:${when}`);
            }
        }
        const results = [];
        const fetchOneFeed = async (q, hl, gl) => {
            var _a;
            try {
                const feed = await parser.parseURL(gnewsUrl(q, hl, gl));
                const items = ((_a = feed.items) !== null && _a !== void 0 ? _a : []).map((it) => {
                    var _a, _b;
                    return ({
                        title: (_a = it.title) !== null && _a !== void 0 ? _a : '',
                        link: (_b = it.link) !== null && _b !== void 0 ? _b : '',
                        pubDate: it.pubDate ? new Date(it.pubDate).toISOString() : null,
                        source: it.source || it.creator || it.author || 'Google News',
                    });
                });
                return items;
            }
            catch {
                return [];
            }
        };
        if (country.toUpperCase() === 'ALL') {
            // concurrency batasi agar santun
            const ceidPool = CEIDS_ALL;
            const run = (0, p_limit_1.default)(6);
            const tasks = [];
            for (const ce of ceidPool) {
                for (const q of queries) {
                    tasks.push(run(() => fetchOneFeed(q, ce.hl, ce.gl)));
                }
            }
            const chunks = await Promise.all(tasks);
            for (const arr of chunks)
                results.push(...arr);
        }
        else {
            // single CEID berdasarkan param
            const items = await Promise.all(queries.map((q) => fetchOneFeed(q, lang, country.toUpperCase())));
            results.push(...items.flat());
        }
        /** 3) De-duplicate & sort */
        const norm = (u) => (u !== null && u !== void 0 ? u : '').replace(/#.*$/, '').replace(/&utm_[^=]+=[^&]+/g, '');
        const seen = new Set();
        const deduped = results.filter((a) => {
            const key = norm(a.link) || a.title;
            if (!key || seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        deduped.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
        /** 4) Ambil og:image (limited concurrency) */
        const limitRun = (0, p_limit_1.default)(5);
        const withImages = await Promise.all(deduped.slice(0, limit).map((item) => limitRun(async () => {
            const image = item.link ? await (0, preview_1.getPreviewImage)(item.link) : null;
            return { ...item, image };
        })));
        res.json({
            scope: country.toUpperCase() === 'ALL' ? 'global-all' : scope,
            lang,
            country,
            when,
            count: withImages.length,
            items: withImages,
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});
exports.default = router;
