# TC-GATE-004: Заявка з window_start далі ніж за 60 днів відхиляється гейтом TIME_WINDOW

**ID:** TC-GATE-004
**Type:** API
**Doc ref:** `docs/06-business-rules.md` §1.4 `TIME_WINDOW` — «Maximum advance booking: ≤ 60 days before `window_start`.» (`TSD-4` §2.2); §6 `rule_reference` values — `TIME_WINDOW` · Booked too far in advance · `TSD-4 §2.2`. Порядок гейтів: §0 «`PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW`». Формат `422`: `docs/03-api-contract.md` «The `422` body».

## Preconditions
- Оператор залогінений (сесійна cookie).
- Пілот цього оператора з чинним сертифікатом на `window_start` і `rating`, що покриває клас зони, тож гейт `PILOT` проходить.
- Літак цього оператора з ваговою категорією, дозволеною в зоні, тож гейт `AIRCRAFT` проходить.
- Активна зона, для якої оператор має достатній `authorisation_level`, а `requested_altitude_metres` не перевищує `ceiling_metres`, тож гейт `ZONE` проходить.
- Заявка цього оператора у стані `DRAFT`, де `window_start` настає більш ніж через 60 днів від моменту надсилання submit. Решта умов `TIME_WINDOW` дотримані: lead time не менший за 6 годин, тривалість у межах 15–240 хвилин, вікно поза curfew зони, немає перетину з іншими `APPROVED`/`UNDER_REVIEW` заявками цього літака.

## Steps
1. Надіслати `POST /api/v1/flight-requests/{id}/submit` для цієї заявки.

## Expected result
Відповідь `422` з тілом, де `failing_gate: "TIME_WINDOW"` і `rule_reference: "TSD-4 §2.2"`.
