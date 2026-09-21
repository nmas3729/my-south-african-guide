import "server-only";

export type VerificationEmail = { email: string; token: string };
export type PasswordResetEmail = { email: string; token: string };

export interface TransactionalEmailService {
  sendVerificationEmail(message: VerificationEmail): Promise<void>;
  sendPasswordResetEmail(message: PasswordResetEmail): Promise<void>;
  sendBookingNotification(message: { email: string; bookingId: string }): Promise<void>;
  sendGuideNotification(message: { email: string; bookingId: string }): Promise<void>;
  sendAdminNotification(message: { email: string; subject: string }): Promise<void>;
}

class DeferredEmailService implements TransactionalEmailService {
  async sendVerificationEmail(): Promise<void> {}
  async sendPasswordResetEmail(): Promise<void> {}
  async sendBookingNotification(): Promise<void> {}
  async sendGuideNotification(): Promise<void> {}
  async sendAdminNotification(): Promise<void> {}
}

export const emailService: TransactionalEmailService = new DeferredEmailService();
export const sendVerificationEmail = emailService.sendVerificationEmail.bind(emailService);
export const sendPasswordResetEmail = emailService.sendPasswordResetEmail.bind(emailService);