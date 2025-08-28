"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const node_path_1 = __importDefault(require("node:path"));
const node_http_1 = __importDefault(require("node:http"));
const morgan_1 = __importDefault(require("morgan"));
// Routers
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
// Role guards (optional)
const role_1 = require("./middleware/role");
const app = (0, express_1.default)();
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_PORT = Number(process.env.PORT || 4000);
/* ---------------------------- FRONTEND ORIGIN ---------------------------- */
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const defaultAllowed = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const envAllowed = FRONTEND_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultAllowed, ...envAllowed]));
const corsOptions = {
    origin(origin, cb) {
        if (!origin)
            return cb(null, true); // server-to-server / tools
        if (allowedOrigins.includes(origin))
            return cb(null, true);
        return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Employer-Id'],
};
app.use((0, cors_1.default)(corsOptions));
app.options('*', (0, cors_1.default)(corsOptions));
/* --------------------------- Basic Middlewares --------------------------- */
if (NODE_ENV === 'production')
    app.set('trust proxy', 1);
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '5mb' }));
app.use((0, cookie_parser_1.default)());
// Simple request logger
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});
// Serve static files (public/uploads)
app.use('/uploads', express_1.default.static(node_path_1.default.join(process.cwd(), 'public', 'uploads')));
/* ------------------------------ Health Checks ----------------------------- */
app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'healthy' }));
/* --------------------------------- Routes --------------------------------- */
// Auth kandidat/user
app.use('/auth', auth_1.default);
// Admin auth / dashboard
app.use('/admin', admin_1.default);
// News & Chat
app.use('/api/news', news_1.default);
app.use('/api/chat', chat_1.default);
// Tenders (public)
app.use('/api/tenders', tenders_1.default);
// Admin manage tenders
app.use('/admin/tenders', admin_tenders_1.default);
// Employer auth (signup/signin/signout/me)
app.use('/api/employers/auth', employer_auth_1.default);
// Employer features (step1–5, profile, etc.)
app.use('/api/employers', employer_1.employerRouter);
// Admin plans & payments
app.use('/admin/plans', admin_plans_1.default);
app.use('/api/payments', payments_1.default);
// Jobs API
app.use('/api', jobs_1.jobsRouter);
/* -------------------------- Protected Examples --------------------------- */
app.get('/api/profile', role_1.authRequired, (req, res) => {
    res.json({ ok: true, whoami: req.auth });
});
app.get('/api/employer/dashboard', role_1.employerRequired, (req, res) => {
    res.json({ ok: true, message: 'Employer-only area', whoami: req.auth });
});
app.post('/api/admin/stats', role_1.adminRequired, (req, res) => {
    res.json({ ok: true, message: 'Admin-only area', whoami: req.auth });
});
/* --------------------------------- 404 ----------------------------------- */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
/* ----------------------------- Error Handler ----------------------------- */
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    if (err instanceof Error && err.message.startsWith('Not allowed by CORS')) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }
    res.status(500).json({ error: 'Internal server error' });
});
/* --------------------------- Start Server w/ Port Fallback --------------------------- */
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
        console.log(`FRONTEND_ORIGIN(s) : ${allowedOrigins.join(', ')}`);
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
