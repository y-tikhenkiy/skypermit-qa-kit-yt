# TC-GATE-002: Рівень авторизації оператора нижчий за вимогу зони відхиляється гейтом ZONE

**ID:** TC-GATE-002
**Type:** API
**Doc ref:** `docs/06-business-rules.md` §1.3 `ZONE` — «Operator's `authorisation_level` must be ≥ the zone's `required_authorisation_level` (`L1` < `L2` < `L3`). Independent of pilot rating and aircraft band.»; §6 `rule_reference` values — `ZONE` · Operator authorisation level too low · `OH-1 §4`. Підтверджено: `docs/07-clarifications.md` §4. Формат `422`: `docs/03-api-contract.md` «The `422` body».

## Preconditions
- Оператор залогінений (сесійна cookie), має `authorisation_level` = `L1`.
- Зона `KBP-CTR-3` з `required_authorisation_level` = `L2` (клас `CONTROLLED`, `ceiling_metres` = 120, `permitted_bands` C0–C2, `active`).
- Пілот цього оператора з `rating` = `R_ADVANCED` і чинним сертифікатом на `window_start`, тож гейт `PILOT` проходить.
- Літак цього оператора з `mtom_grams` не більше 12 000 (діапазон C0–C2), тож гейт `AIRCRAFT` проходить.
- Заявка цього оператора у стані `DRAFT` для зони `KBP-CTR-3` із `requested_altitude_metres` не вище 120.

## Steps
1. Надіслати `POST /api/v1/flight-requests/{id}/submit` для цієї заявки.

## Expected result
Відповідь `422` з тілом, де `failing_gate: "ZONE"` і `rule_reference: "OH-1 §4"`.
