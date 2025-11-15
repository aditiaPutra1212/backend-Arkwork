"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const CACHE = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 menit
function getCache(key) {
    const hit = CACHE.get(key);
    if (!hit)
        return null;
    if (Date.now() - hit.fetchedAt > TTL_MS) {
        CACHE.delete(key);
        return null;
    }
    return hit.data;
}
function setCache(key, data) {
    CACHE.set(key, { fetchedAt: Date.now(), data });
}
/** ===== Helper: fetch with timeout ===== */
async function fetchWithTimeout(url, ms = 8000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
        const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
        return r;
    }
    finally {
        clearTimeout(t);
    }
}
/**
 * GET /api/rates?base=USD&symbols=IDR[,&provider=open|exchangerate]
 * Balikkan { rate: number, base, symbol, provider, updated_at }
 */
router.get('/', async (req, res) => {
    var _a, _b;
    const base = String(req.query.base || 'USD').toUpperCase();
    // izinkan symbols=IDR atau symbols=IDR,EUR -> ambil yang pertama
    const rawSymbols = String(req.query.symbols || req.query.symbol || 'IDR').toUpperCase();
    const symbol = rawSymbols.split(',')[0].trim();
    // pilih provider:
    // - jika query provider=... diberikan → patuhi
    // - jika ada EXCHANGERATE_API_KEY → default "exchangerate"
    // - selain itu default "open"
    const qProvider = String(req.query.provider || '').toLowerCase();
    const hasKey = !!process.env.EXCHANGERATE_API_KEY;
    const provider = qProvider === 'exchangerate' ? 'exchangerate'
        : qProvider === 'open' ? 'open'
            : hasKey ? 'exchangerate'
                : 'open';
    try {
        let url;
        let cacheKey;
        if (provider === 'exchangerate') {
            // https://v6.exchangerate-api.com/v6/<KEY>/latest/<BASE>
            const key = process.env.EXCHANGERATE_API_KEY;
            url = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/latest/${encodeURIComponent(base)}`;
            cacheKey = `exchangerate:${base}`;
        }
        else {
            // https://open.er-api.com/v6/latest/<BASE>
            url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
            cacheKey = `open:${base}`;
        }
        // cache hit?
        let data = getCache(cacheKey);
        if (!data) {
            const r = await fetchWithTimeout(url, 8000);
            if (!r.ok) {
                // coba fallback otomatis ke provider lain jika default gagal dan user tidak mengunci provider via query
                if (!qProvider) {
                    const altProvider = provider === 'exchangerate' ? 'open' : 'exchangerate';
                    const altUrl = altProvider === 'open'
                        ? `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`
                        : `https://v6.exchangerate-api.com/v6/${encodeURIComponent(process.env.EXCHANGERATE_API_KEY || '')}/latest/${encodeURIComponent(base)}`;
                    const altResp = await fetchWithTimeout(altUrl, 8000);
                    if (altResp.ok) {
                        data = await altResp.json();
                        setCache(`${altProvider}:${base}`, data);
                        const rate = Number((_b = ((_a = data === null || data === void 0 ? void 0 : data.conversion_rates) !== null && _a !== void 0 ? _a : data === null || data === void 0 ? void 0 : data.rates)) === null || _b === void 0 ? void 0 : _b[symbol]);
                        if (!Number.isFinite(rate)) {
                            return res.status(400).json({ error: 'RATE_NOT_FOUND', base, symbol });
                        }
                        return res.json({
                            rate,
                            base,
                            symbol,
                            provider: altProvider === 'open' ? 'open.er-api.com' : 'exchangerate-api.com',
                            updated_at: (data === null || data === void 0 ? void 0 : data.time_last_update_utc) ||
                                (data === null || data === void 0 ? void 0 : data.time_last_update) ||
                                (data === null || data === void 0 ? void 0 : data.time_last_update_unix) ||
                                null,
                        });
                    }
                }
                throw new Error(`HTTP ${r.status}`);
            }
            data = await r.json();
            setCache(cacheKey, data);
        }
        // normalisasi field rates
        // exchangerate-api: { conversion_rates: { IDR: ... } }
        // open.er-api:     { rates: { IDR: ... } } atau { conversion_rates } (variasi)
        const rates = (data === null || data === void 0 ? void 0 : data.conversion_rates) || (data === null || data === void 0 ? void 0 : data.rates);
        const rate = Number(rates === null || rates === void 0 ? void 0 : rates[symbol]);
        if (!Number.isFinite(rate)) {
            return res.status(400).json({ error: 'RATE_NOT_FOUND', base, symbol });
        }
        return res.json({
            rate,
            base,
            symbol,
            provider: provider === 'open' ? 'open.er-api.com' : 'exchangerate-api.com',
            updated_at: (data === null || data === void 0 ? void 0 : data.time_last_update_utc) ||
                (data === null || data === void 0 ? void 0 : data.time_last_update) ||
                (data === null || data === void 0 ? void 0 : data.time_last_update_unix) ||
                null,
        });
    }
    catch (e) {
        console.error('RATE_FETCH_FAILED', e);
        return res.status(500).json({ error: 'RATE_FETCH_FAILED' });
    }
});
exports.default = router;
