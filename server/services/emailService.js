import * as brevo from '@getbrevo/brevo';
import nodemailer from 'nodemailer';

export const emailService = {
  /**
   * Dispatches a 6-digit OTP to the user's institutional email address.
   * Supports Brevo (BREVO_API_KEY) or standard SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, or EMAIL_USER, EMAIL_PASS).
   */
  async sendOtpEmail({ email, otp, username }) {
    console.log(`\n======================================================`);
    console.log(`[ResEYE SURVEILLANCE GATE] OTP DISPATCH FOR ${email}`);
    console.log(`OPERATOR HANDLE: ${username || 'NEW_OPERATOR'}`);
    console.log(`ONE-TIME ACCESS KEY: [ ${otp} ]`);
    console.log(`VALIDITY: 10 MINUTES`);
    console.log(`======================================================\n`);

    const htmlContent = `
      <div style="background-color: #0b0c10; color: #e0e2ec; font-family: 'Courier New', Courier, monospace; padding: 32px; border: 1px solid #2a2d3d; max-width: 520px; margin: 20px auto; border-radius: 4px;">
        <div style="border-bottom: 2px solid #33384c; padding-bottom: 14px; margin-bottom: 20px;">
          <span style="font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #ffffff;">[ ResEYE INTELLIGENCE ARCHIVE ]</span>
          <div style="font-size: 11px; color: #79829c; margin-top: 4px;">SURVEILLANCE & ACADEMIC DOSSIER ACCESS GATE</div>
        </div>
        <p style="font-size: 13px; line-height: 1.6; color: #c4c9d8; margin-bottom: 20px;">
          A clearance verification request was initiated for operator handle <strong>${username || email}</strong>.
          Enter this single-use clearance key to confirm institutional mailbox ownership:
        </p>
        <div style="background: #141722; border: 1px dashed #4e5573; padding: 20px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 11px; letter-spacing: 2px; color: #8a94b3; margin-bottom: 8px;">CLEARANCE VERIFICATION CODE</div>
          <div style="font-size: 34px; font-weight: bold; letter-spacing: 10px; color: #22d3ee;">${otp}</div>
        </div>
        <p style="font-size: 12px; color: #79829c; line-height: 1.5; margin-bottom: 0;">
          This code will expire in 10 minutes. If you did not initiate enrollment into the ResEYE archive, disregard this transmission.
        </p>
      </div>
    `;

    // 1. Check Brevo
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (brevoApiKey) {
      try {
        const apiInstance = new brevo.TransactionalEmailsApi();
        apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);

        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = `[ResEYE Archive] Operator Verification Code: ${otp}`;
        sendSmtpEmail.to = [{ email }];
        sendSmtpEmail.sender = {
          name: process.env.BREVO_SENDER_NAME || 'ResEYE Archives',
          email: process.env.BREVO_SENDER_EMAIL || process.env.SMTP_FROM || 'security@iiitbhopal.ac.in'
        };
        sendSmtpEmail.htmlContent = htmlContent;

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`[ResEYE Email] Successfully sent OTP via Brevo to ${email}`);
        return true;
      } catch (err) {
        console.error(`[ResEYE Brevo Error] Failed to send email via Brevo:`, err?.message || err);
      }
    }

    // 2. Check SMTP / Nodemailer (supports Gmail, college relay, or custom SMTP)
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT) || 587;

    if (smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"ResEYE Archives" <${smtpUser}>`,
          to: email,
          subject: `[ResEYE Archive] Operator Verification Code: ${otp}`,
          html: htmlContent
        });

        console.log(`[ResEYE Email] Successfully sent OTP via SMTP (${smtpHost}) to ${email}`);
        return true;
      } catch (err) {
        console.error(`[ResEYE SMTP Error] Failed to send email via SMTP:`, err?.message || err);
      }
    }

    // If neither configured:
    console.warn(`[ResEYE Email Notice] No email provider configured in .env! Configure BREVO_API_KEY or SMTP_USER & SMTP_PASS in .env to deliver real emails to ${email}.`);
    return false;
  }
};
