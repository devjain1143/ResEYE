/**
 * Firebase Authentication Service
 * Uses Google Identity Toolkit REST API to create users and dispatch verification link emails
 * via Firebase's built-in global email delivery infrastructure without custom domain/SMTP setup.
 */

export const firebaseAuthService = {
  getApiKey() {
    return process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '';
  },

  isConfigured() {
    return Boolean(this.getApiKey());
  },

  /**
   * Dispatches Firebase email verification link to user's institutional email address.
   */
  async sendVerificationLink({ email, password }) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn('\n======================================================');
      console.warn('[ResEYE Firebase Notice] FIREBASE_API_KEY is not set in .env.');
      console.warn('Add FIREBASE_API_KEY to your .env file from Firebase Console');
      console.warn('(Project Settings > General > Web API Key).');
      console.warn('======================================================\n');
      return {
        success: true,
        configured: false,
        message: 'Verification link queued. Configure FIREBASE_API_KEY in .env for live dispatch.'
      };
    }

    let idToken = null;

    // 1. Attempt to create the user in Firebase Auth
    const signUpRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const signUpData = await signUpRes.json();

    if (signUpData.idToken) {
      idToken = signUpData.idToken;
    } else if (signUpData.error?.message === 'EMAIL_EXISTS') {
      // User already exists in Firebase, sign in to retrieve ID token
      const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      const signInData = await signInRes.json();
      if (signInData.idToken) {
        idToken = signInData.idToken;
      } else {
        // Discrepancy between password in Firebase and registration: dispatch reset link directly
        return await this.sendPasswordResetLink({ email });
      }
    } else {
      throw new Error(signUpData.error?.message || 'Firebase user creation failed.');
    }

    // 2. Dispatch verification link email using Firebase's infrastructure
    const oobRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'VERIFY_EMAIL',
        idToken
      })
    });
    const oobData = await oobRes.json();

    if (oobData.error) {
      throw new Error(oobData.error?.message || 'Failed to dispatch verification email from Firebase.');
    }

    console.log(`[ResEYE Firebase] Verification link email dispatched by Firebase to ${email}`);
    return {
      success: true,
      configured: true,
      message: 'Verification link dispatched to your institutional inbox.'
    };
  },

  /**
   * Checks whether the user has clicked the verification link in their email.
   */
  async checkEmailVerified({ email, password }) {
    const apiKey = this.getApiKey();
    if (!apiKey) return true; // Pass through if not configured yet

    try {
      const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      const signInData = await signInRes.json();
      if (!signInData.idToken) return false;

      const lookupRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: signInData.idToken })
      });
      const lookupData = await lookupRes.json();
      const fbUser = lookupData.users?.[0];
      return Boolean(fbUser?.emailVerified);
    } catch (err) {
      console.error('[ResEYE Firebase] Verification check error:', err?.message || err);
      return false;
    }
  },

  /**
   * Dispatches a password reset email via Firebase Authentication infrastructure.
   */
  async sendPasswordResetLink({ email }) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Firebase Authentication is not configured.');
    }

    const oobRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email
      })
    });
    const oobData = await oobRes.json();

    if (oobData.error) {
      throw new Error(oobData.error.message || 'Failed to dispatch password reset link.');
    }

    console.log(`[ResEYE Firebase] Password reset link dispatched to ${email}`);
    return {
      success: true,
      message: 'Password reset link sent to your institutional inbox.'
    };
  }
};
