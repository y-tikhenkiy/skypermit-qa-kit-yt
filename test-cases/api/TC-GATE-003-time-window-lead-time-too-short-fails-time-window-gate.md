# TC-GATE-003: Заявка з часом до window_start менше 6 годин відхиляється гейтом TIME_WINDOW

**ID:** TC-GATE-003
**Type:** API
**Doc ref:** `docs/06-business-rules.md` §1.4 `TIME_WINDOW` — «Minimum lead time: ≥ 6 hours between submission and `window_start`.» (`TSD-4` §2.1); §6 `rule_reference` values — `TIME_WINDOW` · Lead time too short · `TSD-4 §2.1`. Порядок гейтів: §0 «`PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW`». Формат `422`: `docs/03-api-contract.md` «The `422` body».

## Preconditions
- Оператор залогінений (сесійна cookie).
- Пілот цього оператора з чинним сертифікатом на `window_start` і `rating`, що покриває клас зони, тож гейт `PILOT` проходить.
- Літак цього оператора з ваговою категорією, дозволеною в зоні, тож гейт `AIRCRAFT` проходить.
- Активна зона, для якої оператор має достатній `authorisation_level`, а `requested_altitude_metres` не перевищує `ceiling_metres`, тож гейт `ZONE` проходить.
- Заявка цього оператора у стані `DRAFT`, де `window_start` настає менше ніж через 6 годин від моменту надсилання submit. Решта умов `TIME_WINDOW` дотримані: тривалість у межах 15–240 хвилин, вікно поза curfew зони, немає перетину з іншими `APPROVED`/`UNDER_REVIEW` заявками цього літака.

## Steps
1. Надіслати `POST /api/v1/flight-requests/{id}/submit` для цієї заявки.

## Expected result
Відповідь `422` з тілом, де `failing_gate: "TIME_WINDOW"` і `rule_reference: "TSD-4 §2.1"`.
