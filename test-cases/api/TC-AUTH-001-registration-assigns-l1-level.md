# TC-AUTH-001: Реєстрація оператора створює його з рівнем доступу L1

**ID:** TC-AUTH-001
**Type:** API
**Doc ref:** `docs/03-api-contract.md` «Authentication & authorisation» — «Registration always creates an operator at `L1` (least privilege); raising it is an out-of-band admin action, not a registration-form field.»

## Preconditions
- Оператора з таким самим `email` і `national_id`, які використовуються в кроці 1, у системі немає (обидва поля `unique`).
- Ніхто не залогінений (сесійної cookie немає).

## Steps
1. Надіслати `POST /api/v1/operators` з валідними даними: `legal_name`, `national_id`, `email`, `password`, `phone`, `address_line`, `city`, `postal_code` (`national_id` і `email` унікальні). Поле `authorisation_level` у запиті не передавати. (Довідково, лише з коду `app/api/v1/operators/route.ts:28`: поле пароля називається `password`, мінімальна довжина — 8 символів; контракт API цього не описує.)
2. Надіслати `GET /api/v1/auth/me` з сесійною cookie, яку виставила відповідь на крок 1.

## Expected result
Запит `GET /api/v1/auth/me` успішний (не `401`), а профіль оператора у відповіді має `authorisation_level` = `L1`. (Числовий код успіху контракт не вказує — лише «profile, or `401`».)
