import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private fromEmail: string;
  private frontendUrl: string;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL')!;
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL')!;
  }

  /**
   * Send email verification for new user signup
   */
  async sendVerificationEmail(
    email: string,
    userName: string,
    verificationToken: string,
  ): Promise<void> {
    try {
      const verificationUrl = `${this.frontendUrl}/verify-email?token=${verificationToken}`;

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Verify Your Email Address',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                      <!-- Header -->
                      <tr>
                        <td style="background-color: #4CAF50; padding: 30px; text-align: center;">
                          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Welcome to Our App!</h1>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px;">
                          <h2 style="color: #333333; margin-top: 0;">Hi ${userName},</h2>
                          <p style="color: #666666; font-size: 16px; line-height: 1.6;">
                            Thank you for signing up! We're excited to have you on board.
                          </p>
                          <p style="color: #666666; font-size: 16px; line-height: 1.6;">
                            Please verify your email address by clicking the button below:
                          </p>
                          
                          <!-- Button -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                            <tr>
                              <td align="center">
                                <a href="${verificationUrl}" 
                                   style="display: inline-block; padding: 14px 40px; background-color: #4CAF50; 
                                          color: #ffffff; text-decoration: none; border-radius: 5px; 
                                          font-weight: bold; font-size: 16px;">
                                  Verify Email Address
                                </a>
                              </td>
                            </tr>
                          </table>
                          
                          <p style="color: #666666; font-size: 14px; line-height: 1.6;">
                            Or copy and paste this link in your browser:
                          </p>
                          <p style="color: #4CAF50; font-size: 14px; word-break: break-all;">
                            ${verificationUrl}
                          </p>
                          
                          <p style="color: #999999; font-size: 12px; margin-top: 30px;">
                            This verification link will expire in 24 hours.
                          </p>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #f8f8f8; padding: 20px; text-align: center;">
                          <p style="color: #999999; font-size: 12px; margin: 0;">
                            If you didn't create this account, please ignore this email.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });

      if (error) {
        this.logger.error(
          `Failed to send verification email to ${email}:`,
          error,
        );
        throw new Error('Failed to send verification email');
      }

      this.logger.log(
        `Verification email sent successfully to ${email}, ID: ${data?.id}`,
      );
    } catch (error) {
      this.logger.error('Error sending verification email:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    userName: string,
    resetToken: string,
  ): Promise<void> {
    try {
      const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Reset Your Password',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                      <!-- Header -->
                      <tr>
                        <td style="background-color: #2196F3; padding: 30px; text-align: center;">
                          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Password Reset</h1>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px;">
                          <h2 style="color: #333333; margin-top: 0;">Hi ${userName},</h2>
                          <p style="color: #666666; font-size: 16px; line-height: 1.6;">
                            We received a request to reset your password. Click the button below to create a new password:
                          </p>
                          
                          <!-- Button -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                            <tr>
                              <td align="center">
                                <a href="${resetUrl}" 
                                   style="display: inline-block; padding: 14px 40px; background-color: #2196F3; 
                                          color: #ffffff; text-decoration: none; border-radius: 5px; 
                                          font-weight: bold; font-size: 16px;">
                                  Reset Password
                                </a>
                              </td>
                            </tr>
                          </table>
                          
                          <p style="color: #666666; font-size: 14px; line-height: 1.6;">
                            Or copy and paste this link in your browser:
                          </p>
                          <p style="color: #2196F3; font-size: 14px; word-break: break-all;">
                            ${resetUrl}
                          </p>
                          
                          <p style="color: #ff5722; font-size: 14px; margin-top: 30px;">
                            ⚠️ This link will expire in 1 hour.
                          </p>
                          
                          <p style="color: #999999; font-size: 12px; margin-top: 30px;">
                            If you didn't request a password reset, please ignore this email or contact support if you have concerns.
                          </p>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #f8f8f8; padding: 20px; text-align: center;">
                          <p style="color: #999999; font-size: 12px; margin: 0;">
                            For security reasons, never share this link with anyone.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });

      if (error) {
        this.logger.error(
          `Failed to send password reset email to ${email}:`,
          error,
        );
        throw new Error('Failed to send password reset email');
      }

      this.logger.log(
        `Password reset email sent successfully to ${email}, ID: ${data?.id}`,
      );
    } catch (error) {
      this.logger.error('Error sending password reset email:', error);
      throw error;
    }
  }

  /**
   * Send welcome email after successful verification
   */
  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Welcome! Your Account is Verified',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                      <tr>
                        <td style="padding: 40px 30px; text-align: center;">
                          <h1 style="color: #4CAF50; margin-top: 0;">🎉 Welcome Aboard!</h1>
                          <h2 style="color: #333333;">Hi ${userName},</h2>
                          <p style="color: #666666; font-size: 16px; line-height: 1.6;">
                            Your email has been verified successfully! You're all set to start using our app.
                          </p>
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                            <tr>
                              <td align="center">
                                <a href="${this.frontendUrl}/login" 
                                   style="display: inline-block; padding: 14px 40px; background-color: #4CAF50; 
                                          color: #ffffff; text-decoration: none; border-radius: 5px; 
                                          font-weight: bold; font-size: 16px;">
                                  Get Started
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });

      if (error) {
        this.logger.error(`Failed to send welcome email to ${email}:`, error);
        throw new Error('Failed to send welcome email');
      }

      this.logger.log(
        `Welcome email sent successfully to ${email}, ID: ${data?.id}`,
      );
    } catch (error) {
      this.logger.error('Error sending welcome email:', error);
      throw error;
    }
  }

  /**
   * Send generic notification email
   */
  async sendNotificationEmail(
    email: string,
    subject: string,
    message: string,
  ): Promise<void> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject,
        html: `
          <!DOCTYPE html>
          <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto;">
                ${message}
              </div>
            </body>
          </html>
        `,
      });

      if (error) {
        this.logger.error(
          `Failed to send notification email to ${email}:`,
          error,
        );
        throw new Error('Failed to send notification email');
      }

      this.logger.log(
        `Notification email sent successfully to ${email}, ID: ${data?.id}`,
      );
    } catch (error) {
      this.logger.error('Error sending notification email:', error);
      throw error;
    }
  }
}
