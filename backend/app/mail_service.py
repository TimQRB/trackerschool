import os
from pathlib import Path
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import EmailStr

# Конфигурация подключения
conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER"),
    MAIL_FROM_NAME=os.getenv("MAIL_FROM_NAME"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

async def send_onboarding_email(email_to: str, temp_password: str): 
    html = f"""
    <html>
        <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px;">
                <h2 style="color: #2563eb;">Добро пожаловать в SafeMektep!</h2>
                <p>Здравствуйте!</p>
                <p>Ваша школа добавила вас в систему отслеживания безопасности учеников. 
                Для входа в личный кабинет используйте следующие данные:</p>
                
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>Логин (Email):</strong> {email_to}</p>
                    <p style="margin: 5px 0;"><strong>Временный пароль:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">{temp_password}</code></p>
                </div>
                
                <p>При первом входе вам нужно будет указать ваше ФИО и сменить пароль на постоянный.</p>
                
                <a href="http://localhost:5173/login" 
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">
                   Войти в систему
                </a>
                
                <p style="font-size: 12px; color: #64748b; margin-top: 30px;">
                    Это автоматическое письмо, на него не нужно отвечать.
                </p>
            </div>
        </body>
    </html>
    """

    message = MessageSchema(
        subject="Ваши данные для входа в SafeMektep",
        recipients=[email_to],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    await fm.send_message(message)