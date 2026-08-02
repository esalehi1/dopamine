# ساخت APK اندروید

این مخزن فایل `dopamine-reset-pwa.zip` را به یک اپ اندروید آفلاین تبدیل می‌کند.

## خروجی

Workflow با نام **Build Android APK** یک APK دیباگ امضاشده و قابل نصب می‌سازد و آن را با نام Artifact زیر نگه می‌دارد:

```text
dopamine-reset-android-apk
```

فایل داخل Artifact:

```text
Dopamine-Reset-v1.0.0-debug.apk
```

## فناوری

- Capacitor 8
- Local Notifications بومی اندروید
- Node.js 22
- Gradle Wrapper تولیدشده توسط Capacitor
- GitHub Actions

## یادآورها

هدف‌های زمان‌دار، مرور شبانه، تایمر تمرکز و تایمر عبور از وسوسه با اعلان محلی اندروید اجرا می‌شوند. در اندروید 13 به بعد باید اجازه اعلان داده شود. برای اجرای دقیق ساعت‌ها در اندروید 12 به بعد، برنامه کاربر را به تنظیم دسترسی هشدار دقیق هدایت می‌کند.
