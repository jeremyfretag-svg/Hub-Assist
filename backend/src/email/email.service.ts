import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  constructor(private readonly mailerService: MailerService) {}

  private async sendTemplate(to: string, subject: string, template: string, context: any): Promise<void> {
    try {
      if (!context) {
        throw new InternalServerErrorException(`Missing context for email template: ${template}`);
      }
      
      await this.mailerService.sendMail({
        to,
        subject,
        template,
        context: {
          ...context,
          // Common template variables could go here
        },
      });
    } catch (error: any) {
      // In case template rendering fails due to missing variables or other issues
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to send email: ${error.message}`);
    }
  }

  async sendVerificationOtp(email: string, otp: string): Promise<void> {
    if (!otp) throw new InternalServerErrorException('Missing required variable: otp');
    await this.sendTemplate(email, 'Verify Your Email', 'otp-verification', { otp });
  }

  async sendVerificationLink(email: string, link: string): Promise<void> {
    if (!link) throw new InternalServerErrorException('Missing required variable: link');
    await this.sendTemplate(email, 'Verify Your Email', 'welcome', { link });
  }

  async sendPasswordResetOtp(email: string, otp: string): Promise<void> {
    if (!otp) throw new InternalServerErrorException('Missing required variable: otp');
    await this.sendTemplate(email, 'Reset Your Password', 'password-reset', { otp });
  }

  async sendPasswordResetSuccess(email: string): Promise<void> {
    await this.sendTemplate(email, 'Password Reset Successful', 'welcome', { message: 'Your password was successfully reset.' });
  }

  async sendContactConfirmation(email: string, name: string): Promise<void> {
    if (!name) throw new InternalServerErrorException('Missing required variable: name');
    await this.sendTemplate(email, 'We Received Your Message', 'welcome', { name, message: 'We have received your message and will get back to you soon.' });
  }

  async sendContactNotification(adminEmail: string, name: string, message: string): Promise<void> {
    if (!name || !message) throw new InternalServerErrorException('Missing required variables');
    await this.sendTemplate(adminEmail, 'New Contact Form Submission', 'welcome', { name, message });
  }

  async sendNewsletterConfirmation(email: string): Promise<void> {
    await this.sendTemplate(email, 'Confirm Your Newsletter Subscription', 'welcome', { message: 'Please confirm your newsletter subscription.' });
  }

  async sendNewsletterConfirmed(email: string): Promise<void> {
    await this.sendTemplate(email, 'Newsletter Subscription Confirmed', 'welcome', { message: 'Your newsletter subscription is confirmed.' });
  }

  async sendNewsletterUnsubscribed(email: string): Promise<void> {
    await this.sendTemplate(email, 'You Have Been Unsubscribed', 'welcome', { message: 'You have successfully unsubscribed from the newsletter.' });
  }

  async sendBookingConfirmation(email: string, bookingDetails: any): Promise<void> {
    if (!bookingDetails) throw new InternalServerErrorException('Missing required variable: bookingDetails');
    await this.sendTemplate(email, 'Booking Confirmation', 'booking-confirmation', bookingDetails);
  }
}
