# TC-AUTH-002: Після реєстрації через форму оператор одразу залогінений

**ID:** TC-AUTH-002
**Type:** E2E
**Doc ref:** `docs/04-frontend-spec.md` «Operator portal» — «creating both together and logging the operator in immediately.»; `data-testid` `operator-session-info` «shown when logged in»

## Preconditions
- Оператора з таким самим `email` і `national_id`, які вводяться в кроці 2, у системі немає (обидва поля `unique`).
- У браузері немає активної сесії оператора (поточна сторінка показує `operator-login-link` і `operator-register-link`).

## Steps
1. Відкрити сторінку `/register`.
2. Заповнити форму валідними даними: `legal_name`, `national_id`, `email`, пароль, `phone`, `address_line`, `city`, `postal_code` (`national_id` і `email` унікальні). Поле `authorisation_level` у формі відсутнє.
3. Надіслати форму.

## Expected result
Посилання на вхід і реєстрацію (`operator-login-link`, `operator-register-link`) більше не відображаються. Натомість видно інформацію про поточну сесію оператора (`operator-session-info`) і кнопку виходу (`operator-logout-button`).
