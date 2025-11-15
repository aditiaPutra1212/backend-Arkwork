import express, { Request, Response, NextFunction } from 'express'; // Added Request, Response, NextFunction types
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20'; // Added Profile type
// Removed jwt import here as we'll use helpers from auth.ts
import { prisma } from '../lib/prisma';
// --- Import helper functions and constants from auth.ts and middleware ---
// Adjust the path '../routes/auth' if your auth.ts is elsewhere
import { signUserToken, setCookie } from './auth';
// Adjust the path '../middleware/role' if your role.ts is elsewhere
import { USER_COOKIE } from '../middleware/role';
// --- End Imports ---

const router = express.Router();

// --- Ensure FRONTEND_URL is defined ---
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
// ---

/**
 * Passport Google Strategy
 * - Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BACKEND_URL, FRONTEND_URL, JWT_SECRET, USER_COOKIE_NAME
 */
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  // Use BACKEND_URL from env for consistency
  callbackURL: `${process.env.BACKEND_URL || 'http://localhost:4000'}/auth/google/callback`
},
async (accessToken: string, refreshToken: string, profile: Profile, done: (error: any, user?: any) => void) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      console.error('[GoogleStrategy] No email found in Google profile for:', profile.id);
      return done(new Error('No email address provided by Google.'));
    }

    const lowerEmail = email.toLowerCase();
    const photo = profile.photos?.[0]?.value ?? null;
    const provider = 'google';
    const providerId = profile.id;
    const displayName = profile.displayName;

    console.log(`[GoogleStrategy] Processing login for email: ${lowerEmail}, Google ID: ${providerId}`);

    // Find existing user by Google ID first
    let user = await prisma.user.findFirst({
      where: {
        oauthProvider: provider,
        oauthId: providerId
      }
    });

    // If not found by Google ID, try finding by email
    if (!user) {
      console.log(`[GoogleStrategy] User not found by Google ID ${providerId}, trying email ${lowerEmail}`);
      user = await prisma.user.findUnique({ where: { email: lowerEmail } });
    }

    if (!user) {
      // --- Create New User ---
      console.log(`[GoogleStrategy] No existing user found. Creating new user for ${lowerEmail}`);
      user = await prisma.user.create({
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
    } else {
      // --- Update Existing User ---
      console.log(`[GoogleStrategy] Found existing user ID: ${user.id}. Updating profile and ensuring verification.`);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          // Update name/photo only if Google provides it and it's different? Or always update?
          name: displayName ?? user.name, // Keep existing name if Google doesn't provide one
          photoUrl: photo ?? user.photoUrl, // Keep existing photo if Google doesn't provide one
          // Link Google account if not already linked
          oauthProvider: user.oauthProvider ?? provider,
          oauthId: user.oauthId ?? providerId,
          isVerified: true, // <<<--- ENSURE IS VERIFIED
        },
      });
      console.log(`[GoogleStrategy] User ID ${user.id} updated.`);
    }

    // Pass the user object (with potentially updated fields) to the callback handler
    return done(null, user);

  } catch (err: any) {
    console.error('[GoogleStrategy] Error during authentication:', err);
    return done(err); // Pass error to Passport
  }
}));

// --- (serialize/deserialize are not strictly needed for JWT but often included with Passport) ---
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user); // Pass user if found, or null if not
  } catch (err) {
    done(err, null);
  }
});
// --- End serialize/deserialize ---


// Route to initiate Google OAuth flow
router.get(
    '/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'], // Request profile and email scopes
        session: false // We are using JWT, not session cookies from Passport
    })
);

// Google Callback route
router.get(
  '/google/callback',
  // Authenticate with Google, handle failures by redirecting
  passport.authenticate('google', {
      session: false, // No Passport sessions
      failureRedirect: `${FRONTEND_URL}/auth/signin?error=google_failed` // Redirect on auth failure
  }),
  // If authenticate succeeds, this handler runs
  (req: Request, res: Response) => {
    // 'user' object is attached to req by the Passport strategy's 'done(null, user)' call
    const user = (req as any).user;

    if (!user || !user.id) {
      console.error('[GoogleCallback] Authentication succeeded but user object is missing or invalid.');
      return res.redirect(`${FRONTEND_URL}/auth/signin?error=internal_error`);
    }

    console.log(`[GoogleCallback] User ${user.email} (ID: ${user.id}) authenticated. Generating token.`);

    try {
      // --- Generate JWT using helper ---
      // Ensure user object has necessary fields (id, role - though role might be null/default)
      const token = signUserToken({ uid: user.id, role: user.role ?? 'user' });

      // --- Set Cookie using helper ---
      // Use USER_COOKIE constant from middleware/role via import
      setCookie(res, USER_COOKIE, token, 30 * 24 * 60 * 60); // Set cookie for 30 days

      console.log(`[GoogleCallback] Token generated and cookie set for user ${user.id}. Redirecting to frontend.`);

      // Redirect back to frontend signin page with a flag
      return res.redirect(`${FRONTEND_URL}/auth/signin?from=google`);

    } catch (error: any) {
        console.error(`[GoogleCallback] Error generating token or setting cookie for user ${user.id}:`, error);
        return res.redirect(`${FRONTEND_URL}/auth/signin?error=token_error`);
    }
  }
);

export default router;