# TC-GATE-005: Заявка з тривалістю вікна поза діапазоном 15–240 хвилин відхиляється гейтом TIME_WINDOW

**ID:** TC-GATE-005
**Type:** API
**Doc ref:** `docs/06-business-rules.md` §1.4 `TIME_WINDOW` — «Duration: 15–240 minutes, inclusive at both ends. `window_end` strictly after `window_start`.» (`TSD-4` §3); §6 `rule_reference` values — `TIME_WINDOW` · Duration out of range · `TSD-4 §3`. Порядок гейтів: «`PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW`». Формат `422`: `docs/03-api-contract.md` «The `422` body».

## Preconditions
- Оператор залогінений (сесійна cookie).
- Пілот цього оператора з чинним сертифікатом на `window_start` і `rating`, що покриває клас зони, тож гейт `PILOT` проходить.
- Літак цього оператора з ваговою категорією, дозволеною в зоні, тож гейт `AIRCRAFT` проходить.
- Активна зона, для якої оператор має достатній `authorisation_level`, а `requested_altitude_metres` не перевищує `ceiling_metres`, тож гейт `ZONE` проходить.
- Заявка цього оператора у стані `DRAFT`, де `window_end` після `window_start`, а тривалість вікна 10 хвилин (менше за мінімум 15). Решта умов `TIME_WINDOW` дотримані: `window_start` настає не менше ніж через 6 годин від моменту submit і не пізніше ніж через 60 днів, вікно поза curfew зони, немає перетину з іншими `APPROVED`/`UNDER_REVIEW` заявками цього літака.

## Steps
1. Надіслати `POST /api/v1/flight-requests/{id}/submit` для цієї заявки.

## Expected result
Відповідь `422` з тілом, де `failing_gate: "TIME_WINDOW"` і `rule_reference: "TSD-4 §3"`.
