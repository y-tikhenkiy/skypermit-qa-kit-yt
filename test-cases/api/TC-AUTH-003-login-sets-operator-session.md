# TC-AUTH-003: Вхід оператора з email і паролем відкриває сесію

**ID:** TC-AUTH-003
**Type:** API
**Doc ref:** `docs/03-api-contract.md` «Authentication & authorisation» — `POST /auth/login`: «Log in with email + password; sets the session cookie»; `GET /auth/me`: «The logged-in operator's profile, or `401`»

## Preconditions
- У системі існує зареєстрований оператор, для якого відомі `email` і пароль.
- Активної сесії немає (сесійної cookie немає).

## Steps
1. Надіслати `POST /api/v1/auth/login` з `email` і `password` цього оператора. (Назви полів `email` і `password` підтверджені лише кодом `app/api/v1/auth/login/route.ts:17-18`; контракт API їх не називає.)
2. Надіслати `GET /api/v1/auth/me` з сесійною cookie, яку виставила відповідь на крок 1.

## Expected result
Відповідь на `GET /api/v1/auth/me` успішна (не `401`) і містить профіль цього оператора (його `email`). (Числовий код успіху контракт не вказує — лише «profile, or `401`».)
