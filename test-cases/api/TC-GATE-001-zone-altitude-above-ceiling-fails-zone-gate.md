# TC-GATE-001: Висота вище стелі зони відхиляється гейтом ZONE

**ID:** TC-GATE-001
**Type:** API
**Doc ref:** `docs/06-business-rules.md` §1.3 `ZONE` — «`requested_altitude_metres` must be ≤ the zone's `ceiling_metres`.»; §6 `rule_reference` values — `ZONE` · Altitude exceeds ceiling · `ZC-2026.1 §2`. Формат `422`: `docs/03-api-contract.md` «The `422` body».

## Preconditions
- Оператор залогінений (сесійна cookie), має рівень `L1`.
- Зона `DNI-OPN-1` зі `ceiling_metres` = 120 (клас `OPEN`, `permitted_bands` C0–C3, `required_authorisation_level` = `L1`, `active`), тому гейти `PILOT` і `AIRCRAFT` для будь-якого пілота й літака з чинним сертифікатом проходять і першим збоєм може бути лише `ZONE`.
- Пілот цього оператора зі чинним сертифікатом на `window_start`.
- Літак цього оператора з `mtom_grams` не більше 30 000.
- Заявка цього оператора у стані `DRAFT` для зони `DNI-OPN-1` із `requested_altitude_metres` = 121.

## Steps
1. Надіслати `POST /api/v1/flight-requests/{id}/submit` для цієї заявки.

## Expected result
Відповідь `422` з тілом, де `failing_gate: "ZONE"` і `rule_reference: "ZC-2026.1 §2"`.
