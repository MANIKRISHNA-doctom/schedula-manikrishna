# Doctor Appointment Scheduling System

This module implements a doctor availability and appointment booking system built with **NestJS + TypeORM**. It supports two advanced scheduling strategies — **STREAM** and **WAVE** — layered on top of two availability types — **Recurring** (weekly) and **Custom** (date-specific overrides).

---

## 1. Core Concepts

### 1.1 Availability Types

| Type | Entity | Description |
|---|---|---|
| **Recurring Availability** | `RecurringAvailability` | A weekly recurring schedule tied to a `dayOfWeek` (e.g. every MONDAY, 9 AM–1 PM). Applies indefinitely until deleted/updated. |
| **Custom Availability (Override)** | `CustomAvailability` | A one-off schedule tied to a specific `date`. Used for holidays, special clinic hours, or one-time slots. **Always takes priority over recurring availability** when both exist for a date. |

### 1.2 Advanced Scheduling Types

This is the heart of the system — every availability block (recurring or custom) is configured with a `schedulingType` of either `STREAM` or `WAVE`.

#### STREAM Scheduling (fixed-slot / token-based)
Used when patients should book a specific, discrete time slot (like a movie ticket).

- Requires `duration` (length of each slot in minutes).
- Optionally accepts `bufferTime` (gap between consecutive slots).
- **Does not** accept `maxCapacity`.
- On creation/update, the system **auto-generates discrete slots** (`CustomSlot` / `RecurringSlot` rows) by walking from `startTime` to `endTime` in increments of `duration + bufferTime`.
- Each generated slot can be booked by exactly one patient (`isBooked` flag for custom slots; for recurring slots, booking is checked per calendar date since the same weekly slot repeats every week).

**Example:** 9:00–11:00 window, 15 min duration, 5 min buffer → slots: `09:00-09:15`, `09:20-09:35`, `09:40-09:55` … etc.

#### WAVE Scheduling (bulk / capacity-based)
Used when many patients are seen within the same time window on a first-come basis (like a walk-in queue), rather than fixed individual slots.

- Requires `maxCapacity` (max number of patients allowed in the window).
- **Does not** accept `duration` or `bufferTime`.
- No slots are pre-generated — instead, the system tracks how many patients have booked into the window:
  - For **Custom** availability: `bookedPatients` counter on the `CustomAvailability` row itself.
  - For **Recurring** availability: booked count is computed live per date by counting `Appointment` rows for that `recurringAvailability` + `appointmentDate`.
- Each booking is assigned a sequential `tokenNumber` (e.g. patient #1, #2, #3…) instead of a time slot.

| | STREAM | WAVE |
|---|---|---|
| Unit of booking | Fixed time slot | Token/queue position |
| Required field | `duration` | `maxCapacity` |
| Forbidden field | `maxCapacity` | `duration`, `bufferTime` |
| Slot generation | Yes (`CustomSlot`/`RecurringSlot`) | No |
| Overbooking protection | One booking per generated slot | Capacity counter check |

---

## 2. Data Model

```
User (DOCTOR) ──1:N── RecurringAvailability ──1:N── RecurringSlot
User (DOCTOR) ──1:N── CustomAvailability ─────1:N── CustomSlot

Appointment
 ├─ patient        → User (PATIENT)
 ├─ doctor         → User (DOCTOR)
 ├─ appointmentDate
 ├─ schedulingType → STREAM | WAVE
 ├─ status         → BOOKED | CANCELLED | COMPLETED
 ├─ tokenNumber     (WAVE only)
 ├─ customSlot              (STREAM + custom override)
 ├─ recurringSlot           (STREAM + recurring)
 ├─ customAvailability      (WAVE + custom override)
 └─ recurringAvailability   (WAVE + recurring)
```

Exactly **one** of `customSlot`, `recurringSlot`, `customAvailability`, `recurringAvailability` is set on any given `Appointment`, depending on which availability/slot the patient booked against.

---

## 3. Doctor Endpoints

All routes are prefixed with `/doctor/availability` and protected by `AuthGuard('jwt')` + `RolesGuard` (`@Roles('DOCTOR')`).

### 3.1 `POST /doctor/availability`
Create a recurring (weekly) availability block.

**Body:** `CreateRecurringAvailabilityDto`
```json
{
  "dayOfWeek": "MONDAY",
  "schedulingType": "STREAM",
  "startTime": "09:00",
  "endTime": "12:00",
  "duration": 15,
  "bufferTime": 5
}
```
or for WAVE:
```json
{
  "dayOfWeek": "MONDAY",
  "schedulingType": "WAVE",
  "startTime": "09:00",
  "endTime": "12:00",
  "maxCapacity": 20
}
```

**Validations performed:**
- `startTime` must be before `endTime`.
- STREAM requires `duration`, forbids `maxCapacity`.
- WAVE requires `maxCapacity`, forbids `duration` and `bufferTime`.
- `duration` cannot exceed the total window length.
- Rejects if it **overlaps** an existing recurring block on the same `dayOfWeek` for this doctor.
- If STREAM, slots are generated immediately after save.

**Response:**
```json
{
  "message": "Recurring availability created successfully.",
  "data": {
    "id": "uuid",
    "dayOfWeek": "MONDAY",
    "schedulingType": "STREAM",
    "startTime": "09:00",
    "endTime": "12:00",
    "duration": 15,
    "bufferTime": 5,
    "maxCapacity": null
  }
}
```

### 3.2 `GET /doctor/availability`
Fetch all recurring availability for the logged-in doctor, ordered by `dayOfWeek` then `startTime`.

### 3.3 `PATCH /doctor/availability/:id`
Update a recurring availability block.

**Body:** `UpdateRecurringAvailabilityDto` (partial fields).

**Behavior:**
- Merges the DTO into the existing record.
- Re-runs all the same validations as creation (timing, scheduling type rules, duration, overlap check against other blocks — excluding itself).
- **Deletes all previously generated `RecurringSlot` rows** for this availability and **regenerates them** if the (possibly updated) type is STREAM.

> ⚠️ Because slots are wiped and regenerated on every update, any slot IDs a patient may have referenced client-side before the update become invalid.

### 3.4 `DELETE /doctor/availability/:id`
Deletes a recurring availability block. Its generated `RecurringSlot` rows are deleted first (to satisfy the FK), then the availability itself is removed.

### 3.5 `POST /doctor/availability/override`
Create a **custom (date-specific) override** — used for holidays, special hours, or one-off schedule changes.

**Body:** `CreateCustomAvailabilityDto`
```json
{
  "date": "2026-08-15",
  "schedulingType": "WAVE",
  "startTime": "10:00",
  "endTime": "13:00",
  "maxCapacity": 15
}
```

**Validations performed:**
- Date cannot be in the past.
- Same time and scheduling-type rules as recurring availability.
- Rejects exact duplicates (same doctor/date/start/end already exists).
- Rejects overlaps with any other custom availability on the same date.
- `bookedPatients` initialized to `0`.
- If STREAM, `CustomSlot` rows are generated immediately.

### 3.6 `GET /doctor/availability/date?date=YYYY-MM-DD`
Returns the doctor's effective availability for a given date, from the doctor's own perspective (i.e. what a doctor would see for their own schedule).

**Resolution order:**
1. If a **custom override** exists for that exact date → return that (ignore recurring entirely for that date).
2. Otherwise, fall back to the **recurring** availability matching that date's weekday.

**Response shape per entry:**
- STREAM → `{ type: 'STREAM', slots: [{ slotId, startTime, endTime }] }` (only *unbooked* slots for custom; for recurring, slots not yet booked for that specific date).
- WAVE → `{ type: 'WAVE', availabilityId, timeWindow, capacity, available: "x/y" }`.

---

## 4. Patient Endpoints

Routes live on the patient controller, protected by `AuthGuard('jwt')` + `RolesGuard` (`@Roles('PATIENT')`).

### 4.1 `GET /patient/doctor/:doctorId/availability?date=YYYY-MM-DD`
Lets a patient see a specific doctor's availability for a given date before booking.

**Behavior (mirrors the doctor-facing date lookup, but doctor-agnostic on the caller side):**
- Validates the doctor exists and the date is a valid, non-past date.
- Checks **custom availability** for that date first; if found, returns it (STREAM slots filtered to unbooked only, or WAVE window with computed `available` count).
- Falls back to **recurring availability** matched by weekday, similarly resolving STREAM slot availability (checking existing `Appointment`s per date) or WAVE capacity (counting bookings for that date).
- Returns `{ message: 'No availability found.', data: [] }` if nothing is configured.

### 4.2 `POST /patient/appointment`
Books an appointment against exactly one of: `customSlotId`, `recurringSlotId`, `customAvailabilityId`, `recurringAvailabilityId`.

**Body:** `CreateAppointmentDto`
```json
{
  "doctorId": "uuid",
  "appointmentDate": "2026-08-03",
  "recurringSlotId": "uuid"
}
```

**Shared pre-checks (all booking types):**
- Patient and doctor must exist with the correct roles.
- Exactly one booking-type field must be provided.
- Patient cannot already have a `BOOKED` appointment with this doctor on this date.
- `appointmentDate` cannot be in the past.

**Per booking-type logic:**

| Field | Path | Key checks | Result |
|---|---|---|---|
| `customSlotId` | STREAM, custom override | Slot exists, `schedulingType === STREAM`, slot's availability date matches `appointmentDate`, slot not already booked | Marks slot `isBooked = true`, creates appointment |
| `recurringSlotId` | STREAM, recurring | Slot exists, `schedulingType === STREAM`, `appointmentDate`'s weekday matches the availability's `dayOfWeek`, no existing `BOOKED` appointment for this slot+date | Creates appointment (slot itself isn't flagged since it repeats weekly — booking uniqueness is per-date) |
| `customAvailabilityId` | WAVE, custom override | Availability exists, `schedulingType === WAVE`, date matches, capacity > 0 and not full | Increments `bookedPatients`, assigns `tokenNumber = bookedPatients`, creates appointment |
| `recurringAvailabilityId` | WAVE, recurring | Availability exists, `schedulingType === WAVE`, weekday matches, capacity > 0 and not full (counted live per date) | Assigns `tokenNumber = bookedCount + 1`, creates appointment |

**Response:**
```json
{
  "message": "Appointment booked successfully.",
  "data": {
    "appointmentId": "uuid",
    "doctorId": "uuid",
    "patientId": "uuid",
    "appointmentDate": "2026-08-03",
    "schedulingType": "STREAM",
    "tokenNumber": null,
    "status": "BOOKED"
  }
}
```

Any request that doesn't match one of the four valid booking paths throws `BadRequestException('Invalid booking request')`.

---

## 5. Validation Summary

| Rule | Enforced in |
|---|---|
| `startTime < endTime` | `validateTime` |
| STREAM requires `duration`, forbids `maxCapacity` | `validateScheduling` |
| WAVE requires `maxCapacity`, forbids `duration`/`bufferTime` | `validateScheduling` |
| `duration` ≤ total window length | `validateDuration` |
| No overlapping recurring blocks per doctor/day | `createRecurring`, `updateRecurring` |
| No overlapping/duplicate custom overrides per doctor/date | `createOverride` |
| No availability for past dates | `validateCustomDate` |
| No appointment booking for past dates | `validateAppointmentDate` |
| Recurring booking date must match the availability's weekday | `validateRecurringDay` |
| No duplicate active booking with same doctor/date | `checkDuplicateBooking` |
| Exactly one booking-type ID per appointment request | `bookAppointment` |

---

## 6. Known Behaviors / Notes for Future Work

- **Custom availability always overrides recurring** for a given date — recurring is never consulted if any custom override exists for that date, even a WAVE override that doesn't cover the full day.
- **Recurring STREAM slots are shared across all weeks** — a slot's "booked" state is determined by checking `Appointment` records for that `slotId` + `appointmentDate`, not by a flag on the slot itself (unlike custom slots, which use `isBooked`).
- **Updating a recurring availability regenerates all of its STREAM slots**, which will orphan any already-booked appointments' slot references if bookings exist before the update — this update path does not currently guard against updating an availability that already has bookings.
- `getAvailabilityByDate` (doctor-facing) currently takes `doctorId` as its first parameter in the service but the controller passes `req.user` — worth double-checking this wiring matches the intended signature.
