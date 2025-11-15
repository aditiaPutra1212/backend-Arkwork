"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/index.ts (VERSI ASLI ANDA YANG SUDAH BENAR)
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const node_path_1 = __importDefault(require("node:path"));
const node_http_1 = __importDefault(require("node:http"));
const morgan_1 = __importDefault(require("morgan"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
// Routes
const auth_1 = __importDefault(require("./routes/auth"));
const news_1 = __importDefault(require("./routes/news"));
const chat_1 = __importDefault(require("./routes/chat"));
const admin_1 = __importDefault(require("./routes/admin"));
const employer_1 = require("./routes/employer");
const employer_auth_1 = __importDefault(require("./routes/employer-auth"));
const admin_plans_1 = __importDefault(require("./routes/admin-plans"));
const payments_1 = __importDefault(require("./routes/payments"));
const tenders_1 = __importDefault(require("./routes/tenders"));
const admin_tenders_1 = __importDefault(require("./routes/admin-tenders"));
const jobs_1 = require("./routes/jobs");
const reports_1 = __importDefault(require("./routes/reports"));
const rates_1 = __importDefault(require("./routes/rates"));
const google_1 = __importDefault(require("./routes/google"));
// NEW
const applications_1 = __importDefault(require("./routes/applications"));
const employer_applications_1 = __importDefault(require("./routes/employer-applications"));
// Admin Jobs router
const admin_jobs_1 = __importDefault(require("./routes/admin-jobs"));
// DEV helper routes
const auth_dev_1 = __importDefault(require("./routes/auth-dev"));
// 🔔 Dev mail testing
const dev_billing_mail_1 = __importDefault(require("./routes/dev-billing-mail"));
const role_1 = require("./middleware/role");
// 🔔 Aktifkan CRON billing
require("./jobs/billingCron");
const app = (0, express_1.default)();
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_PORT = Number(process.env.PORT || 4000);
app.set('etag', false);
/* ======= CORS ======= */
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const defaultAllowed = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
const allowedOrigins = Array.from(new Set([
    ...defaultAllowed,
    ...FRONTEND_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
]));
function isLocalhost(origin) {
    try {
        if (!origin)
            return false;
        const { hostname } = new URL(origin);
        return hostname === 'localhost' || hostname === '127.0.0.1';
    }
    catch {
        return false;
    }
}
function isVercel(origin) {
    try {
        if (!origin)
            return false;
        const { hostname } = new URL(origin);
        return hostname.endsWith('.vercel.app');
    }
    catch {
        return false;
    }
}
const corsOptions = {
    origin(origin, cb) {
        if (!origin)
            return cb(null, true);
        if (allowedOrigins.includes(origin) ||
            isLocalhost(origin) ||
            isVercel(origin))
            return cb(null, true);
        return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Employer-Id',
        'x-employer-id',
    ],
};
app.use((0, cors_1.default)(corsOptions));
app.options('*', (0, cors_1.default)(corsOptions));
if (NODE_ENV === 'production')
    app.set('trust proxy', 1);
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
/* ====== Session & Passport ====== */
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_session_secret';
app.use((0, express_session_1.default)({
    name: 'arkwork.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
/* BigInt -> string (safe untuk res.json) */
app.use((_req, res, next) => {
    const old = res.json.bind(res);
    function conv(x) {
        if (x === null || x === undefined)
            return x;
        if (typeof x === 'bigint')
            return x.toString();
        if (Array.isArray(x))
            return x.map(conv);
        if (typeof x === 'object') {
            const o = {};
            for (const k of Object.keys(x))
                o[k] = conv(x[k]);
            return o;
        }
        return x;
    }
    res.json = (body) => old(conv(body));
    next();
});
/* Log sederhana & static */
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});
app.use('/uploads', express_1.default.static(node_path_1.default.join(process.cwd(), 'public', 'uploads')));
/* ========= HEALTH ========= */
app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'healthy' }));
app.get('/healthz', (_req, res) => res.json({ ok: true }));
/* ========= DEV ROUTES ========= */
if (NODE_ENV !== 'production' && process.env.DEV_AUTH === '1') {
    app.use(auth_dev_1.default);
    app.use(dev_billing_mail_1.default);
}
/* ================= ROUTES (ORDER MATTERS!) ================= */
/* Public / auth routes */
app.use('/auth', auth_1.default); // <-- KEMBALIKAN KE /auth
app.use('/auth', google_1.default); // <-- KEMBALIKAN KE /auth
/* Employer */
app.use('/api/employers/auth', employer_auth_1.default);
app.use('/api/employers', employer_1.employerRouter);
app.use('/api/employers/applications', employer_applications_1.default);
/* Public APIs */
app.use('/api/reports', reports_1.default);
app.use('/api/news', news_1.default);
app.use('/api/chat', chat_1.default);
app.use('/api/rates', rates_1.default);
app.use('/api/tenders', tenders_1.default);
app.use('/api/payments', payments_1.default);
app.use('/api', jobs_1.jobsRouter);
app.use('/api', applications_1.default);
/* ========== ADMIN API ========== */
app.use('/api/admin', admin_1.default);
app.use('/api/admin/jobs', admin_jobs_1.default);
app.use('/api/admin/tenders', admin_tenders_1.default);
app.use('/api/admin/plans', admin_plans_1.default);
/* Example protected endpoints */
app.get('/api/profile', role_1.authRequired, (req, res) => res.json({ ok: true, whoami: req.auth }));
app.get('/api/employer/dashboard', role_1.employerRequired, (_req, res) => res.json({ ok: true, message: 'Employer-only area' }));
app.post('/api/admin/stats', role_1.adminRequired, (_req, res) => res.json({ ok: true }));
/* 404 */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
/* Error handler */
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    if (err instanceof Error && err.message.startsWith('Not allowed by CORS')) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }
    const status = (typeof (err === null || err === void 0 ? void 0 : err.status) === 'number' && err.status) || 500;
    const msg = NODE_ENV !== 'production' ? err === null || err === void 0 ? void 0 : err.message : 'Internal server error';
    res.status(status).json({ error: msg });
});
/* Start Server */
function startServer(port) {
    const server = node_http_1.default.createServer(app);
    server.listen(port);
    server.on('listening', () => {
        console.log('========================================');
        console.log(`🚀 Backend listening on http://localhost:${port}`);
        console.log(`NODE_ENV     	: ${NODE_ENV}`);
        console.log(`FRONTEND_ORIGIN(s) : ${allowedOrigins.join(', ')}`);
        console.log('✅ Billing CRON     : loaded (via import ./jobs/billingCron)');
        if (NODE_ENV !== 'production' && process.env.DEV_AUTH === '1') {
            console.log('✅ Dev mail route   : GET /dev/mail/try (dev only)');
            console.log('✅ Dev auth routes 	: enabled (dev only)');
        }
        console.log('✅ Passport-ready   : passport initialized and session enabled');
        console.log('✅ Google OAuth     : route /auth/google loaded'); // <-- Log Anda yang asli
        console.log('========================================');
    });
}
startServer(DEFAULT_PORT);
