"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express")); // Added Request, Response, NextFunction types
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20"); // Added Profile type
// Removed jwt import here as we'll use helpers from auth.ts
const prisma_1 = require("../lib/prisma");
// --- Import helper functions and constants from auth.ts and middleware ---
// Adjust the path '../routes/auth' if your auth.ts is elsewhere
const auth_1 = require("./auth");
// Adjust the path '../middleware/role' if your role.ts is elsewhere
const role_1 = require("../middleware/role");
// --- End Imports ---
const router = express_1.default.Router();
// --- Ensure FRONTEND_URL is defined ---
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
// ---
/**
 * Passport Google Strategy
 * - Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BACKEND_URL, FRONTEND_URL, JWT_SECRET, USER_COOKIE_NAME
 */
passport_1.default.use(new passport_google_oauth20_1.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Use BACKEND_URL from env for consistency
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:4000'}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const email = (_b = (_a = profile.emails) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value;
        if (!email) {
            console.error('[GoogleStrategy] No email found in Google profile for:', profile.id);
            return done(new Error('No email address provided by Google.'));
        }
        const lowerEmail = email.toLowerCase();
        const photo = (_e = (_d = (_c = profile.photos) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.value) !== null && _e !== void 0 ? _e : null;
        const provider = 'google';
        const providerId = profile.id;
        const displayName = profile.displayName;
        console.log(`[GoogleStrategy] Processing login for email: ${lowerEmail}, Google ID: ${providerId}`);
        // Find existing user by Google ID first
        let user = await prisma_1.prisma.user.findFirst({
            where: {
                oauthProvider: provider,
                oauthId: providerId
            }
        });
        // If not found by Google ID, try finding by email
        if (!user) {
            console.log(`[GoogleStrategy] User not found by Google ID ${providerId}, trying email ${lowerEmail}`);
            user = await prisma_1.prisma.user.findUnique({ where: { email: lowerEmail } });
        }
        if (!user) {
            // --- Create New User ---
            console.log(`[GoogleStrategy] No existing user found. Creating new user for ${lowerEmail}`);
            user = await prisma_1.prisma.user.create({
                data: {
                    name: displayName, // Use displayName from Google
                    email: lowerEmail,
                    photoUrl: photo,
                    oauthProvider: provider,
                    oauthId: providerId,
                    isVerified: true, // <<<--- MARK AS VERIFIED
                    // passwordHash remains null
                }
                // Consider selecting only necessary fields if needed later
            });
            console.log(`[GoogleStrategy] New user created with ID: ${user.id}`);
        }
        else {
            // --- Update Existing User ---
            console.log(`[GoogleStrategy] Found existing user ID: ${user.id}. Updating profile and ensuring verification.`);
            user = await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    // Update name/photo only if Google provides it and it's different? Or always update?
                    name: displayName !== null && displayName !== void 0 ? displayName : user.name, // Keep existing name if Google doesn't provide one
                    photoUrl: photo !== null && photo !== void 0 ? photo : user.photoUrl, // Keep existing photo if Google doesn't provide one
                    // Link Google account if not already linked
                    oauthProvider: (_f = user.oauthProvider) !== null && _f !== void 0 ? _f : provider,
                    oauthId: (_g = user.oauthId) !== null && _g !== void 0 ? _g : providerId,
                    isVerified: true, // <<<--- ENSURE IS VERIFIED
                },
            });
            console.log(`[GoogleStrategy] User ID ${user.id} updated.`);
        }
        // Pass the user object (with potentially updated fields) to the callback handler
        return done(null, user);
    }
    catch (err) {
        console.error('[GoogleStrategy] Error during authentication:', err);
        return done(err); // Pass error to Passport
    }
}));
// --- (serialize/deserialize are not strictly needed for JWT but often included with Passport) ---
passport_1.default.serializeUser((user, done) => {
    done(null, user.id);
});
passport_1.default.deserializeUser(async (id, done) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({ where: { id } });
        done(null, user); // Pass user if found, or null if not
    }
    catch (err) {
        done(err, null);
    }
});
// --- End serialize/deserialize ---
// Route to initiate Google OAuth flow
router.get('/google', passport_1.default.authenticate('google', {
    scope: ['profile', 'email'], // Request profile and email scopes
    session: false // We are using JWT, not session cookies from Passport
}));
// Google Callback route
router.get('/google/callback', 
// Authenticate with Google, handle failures by redirecting
passport_1.default.authenticate('google', {
    session: false, // No Passport sessions
    failureRedirect: `${FRONTEND_URL}/auth/signin?error=google_failed` // Redirect on auth failure
}), 
// If authenticate succeeds, this handler runs
(req, res) => {
    var _a;
    // 'user' object is attached to req by the Passport strategy's 'done(null, user)' call
    const user = req.user;
    if (!user || !user.id) {
        console.error('[GoogleCallback] Authentication succeeded but user object is missing or invalid.');
        return res.redirect(`${FRONTEND_URL}/auth/signin?error=internal_error`);
    }
    console.log(`[GoogleCallback] User ${user.email} (ID: ${user.id}) authenticated. Generating token.`);
    try {
        // --- Generate JWT using helper ---
        // Ensure user object has necessary fields (id, role - though role might be null/default)
        const token = (0, auth_1.signUserToken)({ uid: user.id, role: (_a = user.role) !== null && _a !== void 0 ? _a : 'user' });
        // --- Set Cookie using helper ---
        // Use USER_COOKIE constant from middleware/role via import
        (0, auth_1.setCookie)(res, role_1.USER_COOKIE, token, 30 * 24 * 60 * 60); // Set cookie for 30 days
        console.log(`[GoogleCallback] Token generated and cookie set for user ${user.id}. Redirecting to frontend.`);
        // Redirect back to frontend signin page with a flag
        return res.redirect(`${FRONTEND_URL}/auth/signin?from=google`);
    }
    catch (error) {
        console.error(`[GoogleCallback] Error generating token or setting cookie for user ${user.id}:`, error);
        return res.redirect(`${FRONTEND_URL}/auth/signin?error=token_error`);
    }
});
exports.default = router;
