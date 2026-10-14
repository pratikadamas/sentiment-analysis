"""
Email verification and delivery service for Sentiment Pulse.
Supports cryptographically secure token generation, SHA-256 token hashing,
production SMTP delivery (TLS/SSL), multipart HTML/text formatting,
and simulation mode for testing and local development.
"""

import smtplib
import secrets
import hashlib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Tuple, Optional, List, Dict, Any

from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)


def generate_verification_token() -> Tuple[str, str]:
    """
    Generates a cryptographically secure random token and its SHA-256 hash.
    Returns:
        (raw_token, token_hash)
    The raw_token is sent to the user's email.
    The token_hash is stored in the database.
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_verification_token(raw_token)
    return raw_token, token_hash


def hash_verification_token(raw_token: str) -> str:
    """
    Computes SHA-256 hexadecimal digest for token verification and lookup.
    """
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


class EmailService:
    """
    Service responsible for creating and dispatching verification emails.
    """

    def __init__(self):
        # In-memory storage for simulated delivery during local testing
        self.sent_messages: List[Dict[str, Any]] = []

    def clear_sent_messages(self) -> None:
        """Clears in-memory test email queue."""
        self.sent_messages.clear()

    def get_last_sent_token_for(self, email: str) -> Optional[str]:
        """Retrieves the raw token of the last simulated email sent to the given address."""
        clean = email.strip().lower()
        for msg in reversed(self.sent_messages):
            if msg.get("to") == clean:
                return msg.get("raw_token")
        return None

    def build_verification_message(
        self,
        to_email: str,
        username: str,
        verification_url: str,
        expire_minutes: int,
    ) -> MIMEMultipart:
        """
        Builds a professional multipart (plain text & responsive HTML) email message.
        """
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Verify your SentimentPulse email address"
        msg["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
        msg["To"] = to_email

        # 1. Plain Text Version
        plain_text = f"""Hello {username},

Thanks for creating your SentimentPulse account.

Please verify your email address by opening the following link in your browser:
{verification_url}

This verification link expires in {expire_minutes} minutes.

If you did not create this account, you can safely ignore this email.

SentimentPulse
"""

        # 2. Rich Modern HTML Version
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your SentimentPulse email address</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f1f5f9;
    }}
    .wrapper {{
      width: 100%;
      table-layout: fixed;
      background-color: #0b0f19;
      padding: 40px 10px;
    }}
    .container {{
      max-width: 560px;
      margin: 0 auto;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }}
    .header {{
      padding: 32px 32px 20px 32px;
      text-align: center;
      border-bottom: 1px solid #1f2937;
      background: linear-gradient(180deg, rgba(79, 70, 229, 0.08) 0%, rgba(17, 24, 39, 0) 100%);
    }}
    .logo {{
      display: inline-block;
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
      text-decoration: none;
    }}
    .logo-badge {{
      display: inline-block;
      width: 32px;
      height: 32px;
      line-height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: #ffffff;
      margin-right: 8px;
      vertical-align: middle;
      text-align: center;
      font-weight: bold;
    }}
    .content {{
      padding: 36px 32px;
    }}
    h1 {{
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      margin-top: 0;
      margin-bottom: 16px;
      letter-spacing: -0.3px;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 20px 0;
    }}
    .btn-container {{
      text-align: center;
      margin: 32px 0;
    }}
    .btn {{
      display: inline-block;
      background-color: #4f46e5;
      color: #ffffff !important;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 10px;
      box-shadow: 0 4px 14px 0 rgba(79, 70, 229, 0.39);
    }}
    .btn:hover {{
      background-color: #4338ca;
    }}
    .alt-link {{
      word-break: break-all;
      font-size: 13px;
      color: #6366f1;
      text-decoration: underline;
    }}
    .notice {{
      font-size: 13px;
      color: #64748b;
      margin-top: 24px;
      border-top: 1px solid #1f2937;
      padding-top: 20px;
    }}
    .footer {{
      padding: 20px 32px 30px 32px;
      text-align: center;
      font-size: 12px;
      color: #475569;
    }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <span class="logo"><span class="logo-badge">⚡</span>SentimentPulse</span>
      </div>
      <div class="content">
        <h1>Verify your email address</h1>
        <p>Hello <strong style="color: #e2e8f0;">{username}</strong>,</p>
        <p>Thanks for creating your SentimentPulse account. To activate your account and start analyzing feedback intelligence, please verify your email address by clicking the button below:</p>
        
        <div class="btn-container">
          <a href="{verification_url}" class="btn" target="_blank" rel="noopener noreferrer">Verify Email</a>
        </div>

        <p style="font-size: 13px; color: #64748b;">Button not working? You can also copy and paste this verification URL into your browser:</p>
        <p><a href="{verification_url}" class="alt-link">{verification_url}</a></p>

        <div class="notice">
          <p style="margin: 0 0 6px 0;">⏰ <strong>This verification link expires in {expire_minutes} minutes.</strong></p>
          <p style="margin: 0;">If you did not create a SentimentPulse account, no further action is required. You can safely ignore this email.</p>
        </div>
      </div>
      <div class="footer">
        &copy; SentimentPulse AI Platform &bull; Feedback Intelligence Platform
      </div>
    </div>
  </div>
</body>
</html>"""

        msg.attach(MIMEText(plain_text, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))
        return msg

    def send_verification_email(
        self,
        to_email: str,
        username: str,
        raw_token: str,
    ) -> bool:
        """
        Sends verification email via real SMTP if configured,
        or records to memory in simulation mode if SMTP_HOST is not set.
        Returns:
            True if sent / simulated successfully, False if delivery failed.
        """
        clean_email = to_email.strip().lower()
        expire_minutes = settings.EMAIL_VERIFICATION_EXPIRE_MINUTES
        base_url = settings.APP_BASE_URL.rstrip("/")
        verification_url = f"{base_url}/auth/verify-email?token={raw_token}"

        # If SMTP is not configured, operate in simulation mode (ideal for local testing & CI)
        if not settings.SMTP_HOST:
            self.sent_messages.append({
                "to": clean_email,
                "username": username,
                "raw_token": raw_token,
                "url": verification_url,
                "expires_minutes": expire_minutes,
            })
            logger.info(
                f"[EmailService] Simulated verification email to '{clean_email}'. "
                f"Verification URL: {verification_url}"
            )
            return True

        # SMTP configured: attempt production email delivery
        try:
            msg = self.build_verification_message(
                to_email=clean_email,
                username=username,
                verification_url=verification_url,
                expire_minutes=expire_minutes,
            )

            if settings.SMTP_USE_SSL:
                server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
                if settings.SMTP_USE_TLS:
                    server.starttls()

            try:
                if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(msg)
            finally:
                try:
                    server.quit()
                except Exception:
                    pass

            # Also retain in sent_messages for audit/test verification
            self.sent_messages.append({
                "to": clean_email,
                "username": username,
                "raw_token": raw_token,
                "url": verification_url,
                "expires_minutes": expire_minutes,
            })

            logger.info(f"Verification email successfully dispatched to '{clean_email}' via SMTP.")
            return True

        except Exception as exc:
            logger.error(
                f"Failed to dispatch verification email to '{clean_email}': {exc}",
                exc_info=False
            )
            return False


email_service = EmailService()
