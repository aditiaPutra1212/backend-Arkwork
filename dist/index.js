"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const node_path_1 = __importDefault(require("node:path"));
const node_http_1 = __importDefault(require("node:http"));
// Routers (existing)
const auth_1 = __importDefault(require("./routes/auth"));
const news_1 = __importDefault(require("./routes/news"));
const chat_1 = __importDefault(require("./routes/chat"));
const admin_1 = __importDefault(require("./routes/admin"));
const employer_1 = require("./routes/employer");
// Monetization & Payments
const admin_plans_1 = __importDefault(require("./routes/admin-plans"));
const payments_1 = __importDefault(require("./routes/payments"));
const app = (0, express_1.default)();
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
if (NODE_ENV === 'production') {
    // agar Express membaca IP asli di belakang proxy (Heroku/Render/Nginx)
    app.set('trust proxy', 1);
}
/** ---------------- CORS ---------------- */
const origins = FRONTEND_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = {
    origin(origin, cb) {
        // izinkan non-browser (curl, server2server/webhook) yang biasanya tanpa Origin
        if (!origin)
            return cb(null, true);
        if (origins.includes(origin))
            return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
/** --------------- Middlewares --------------- */
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});
app.use((0, cookie_parser_1.default)());
// Midtrans webhook juga JSON → cukup json() (tidak perlu raw body)
app.use(express_1.default.json({ limit: '2mb' }));
app.use((0, cors_1.default)(corsOptions));
app.options('*', (0, cors_1.default)(corsOptions));
/** --------------- Static --------------- */
app.use('/uploads', express_1.default.static(node_path_1.default.join(process.cwd(), 'uploads')));
/** --------------- Health --------------- */
app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) => res.json({ ok: true }));
/** --------------- Routes --------------- */
app.use('/auth', auth_1.default);
app.use('/admin', admin_1.default);
app.use('/api/news', news_1.default);
app.use('/api/chat', chat_1.default);
// Employer 5-step signup
app.use('/api/employers', employer_1.employerRouter);
// Admin Monetization (plans CRUD)
app.use('/admin/plans', admin_plans_1.default);
// Payments / Midtrans (checkout & webhook)
app.use('/api/payments', payments_1.default);
/** --------------- 404 (paling akhir) --------------- */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
/** --------------- Error handler --------------- */
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    if (err instanceof Error && err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }
    res.status(500).json({ error: 'Internal server error' });
});
/** --------------- Listen (auto-retry port) --------------- */
function startServer(startPort, maxTries = 10) {
    let port = startPort;
    let tries = 0;
    const server = node_http_1.default.createServer(app);
    function tryListen() {
        server.listen(port);
    }
    server.on('listening', () => {
        console.log('========================================');
        console.log(`🚀 Backend listening on http://localhost:${port}`);
        console.log(`NODE_ENV           : ${NODE_ENV}`);
        console.log(`FRONTEND_ORIGIN(s) : ${origins.join(', ') || '(none)'}`);
        console.log('========================================');
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && tries < maxTries) {
            console.warn(`Port ${port} in use, trying ${port + 1}...`);
            tries += 1;
            port += 1;
            setTimeout(tryListen, 200);
        }
        else {
            console.error('Failed to start server:', err);
            process.exit(1);
        }
    });
    // graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        server.close(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
        console.log('\nShutting down...');
        server.close(() => process.exit(0));
    });
    tryListen();
}
startServer(DEFAULT_PORT);
