import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import { normalizeInstitutionEmail, ALLOWED_DOMAIN } from './config/domain.js';
import { authService } from './service/auth.service.js';

dotenv.config({ override: true });

const hasGoogleCreds = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (hasGoogleCreds) {
  passport.use(
    'google',
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
        passReqToCallback: true
      },
      async (req, _accessToken, _refreshToken, profile, done) => {
        try {
          const emailObj = profile.emails?.[0];
          const rawEmail = emailObj?.value;
          const email = normalizeInstitutionEmail(rawEmail);
          const verified = emailObj?.verified === true || profile._json?.email_verified === true;
          const hd = profile._json?.hd;
          const needHd = process.env.REQUIRE_GOOGLE_HD === 'true';

          if (!email || !verified || (needHd && hd !== ALLOWED_DOMAIN)) {
            return done(null, false, { message: 'Domain verification failed.' });
          }

          const avatar = profile.photos?.[0]?.value || null;
          const result = await authService.findOrCreateGoogleUser({
            email,
            avatar,
            userAgent: req.get('user-agent'),
            ip: req.ip
          });

          return done(null, result);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
} else {
  // Stub strategy to gracefully handle invocations when credentials are not configured in .env
  passport.use('google', {
    name: 'google',
    authenticate: function () {
      this.fail({ message: 'Institutional Google OAuth is not configured on this server.' }, 400);
    }
  });
}

export default passport;
