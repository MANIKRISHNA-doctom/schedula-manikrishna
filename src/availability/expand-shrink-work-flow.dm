1. Expand Availability Flow

START
  │
  ▼
Doctor requests Expand
  │
  ▼
Find availability by ID
  │
  ├── Not found ───────────────► ERROR
  │
  ▼
Verify availability belongs to doctor
  │
  ├── Not owner ───────────────► FORBIDDEN
  │
  ▼
Get new startTime / endTime
  │
  ▼
Validate time range
  │
  ▼
Check operation is actually EXPAND
  │
  ├── No expansion ────────────► ERROR
  │
  ▼
Check scheduling type
  │
  ├────────────── STREAM ──────────────┐
  │                                    │
  │                                    ▼
  │                         Update start/end time
  │                                    │
  │                                    ▼
  │                              Save availability
  │                                    │
  │                                    ▼
  │                                  COMMIT
  │
  └────────────── WAVE ──────────────────────┐
                                             ▼
                                  Get existing slots
                                             │
                                             ▼
                                  Determine new time range
                                             │
                                             ▼
                                  Create missing slots
                                             │
                                             ▼
                                  Save availability
                                             │
                                             ▼
                                           COMMIT
                                             │
                                             ▼
                                            END



2.Shrink Availability Flow

START
  │
  ▼
Doctor requests Shrink
  │
  ▼
Find availability by ID
  │
  ├── Not found ───────────────► ERROR
  │
  ▼
Verify availability belongs to doctor
  │
  ├── Not owner ───────────────► FORBIDDEN
  │
  ▼
Get new startTime / endTime
  │
  ▼
Validate time range
  │
  ▼
Compare old vs new time
  │
  ├── No change ───────────────► ERROR
  │
  ├── Time expanded ───────────► ERROR
  │
  ▼
Check scheduling type
  │
  ├──────────── STREAM ──────────────┐
  │                                  │
  │                                  ▼
  │                       Update availability
  │                                  │
  │                                  ▼
  │                                COMMIT
  │
  └──────────── WAVE ──────────────────────┐
                                           ▼
                                  Get all existing slots
                                           │
                                           ▼
                                  Identify slots outside
                                  new time window
                                           │
                              ┌────────────┴────────────┐
                              │                         │
                        Free slots                Booked slots
                              │                         │
                              ▼                         ▼
                       Delete later            Need replacement
                                                        │
                                                        ▼
                                             FIND NEXT APPOINTMENT
                                                        │
                                                        ▼
                                             Move booked appointment
                                                        │
                                                        ▼
                                             Mark replacement booked
                                                        │
                                                        ▼
                                             Free old slot
                                                        │
                                                        ▼
                                             Continue for all
                                             affected appointments
                                                        │
                                                        ▼
                                             Verify no appointment
                                             still references slots
                                             to be deleted
                                                        │
                                                        ├── YES ──► ERROR
                                                        │
                                                        ▼
                                             Delete outside slots
                                                        │
                                                        ▼
                                             Update availability
                                                        │
                                                        ▼
                                                     COMMIT
                                                        │
                                                        ▼
                                                       END




3. findNextAvailableSlot Flow

This is the replacement-search flow used during WAVE shrink.

START
  │
  ▼
Input:
doctorId
appointmentDate
reserved slots
daysToSearch
priority
excludedAvailabilityId
excludedSlotIds
  │
  ▼
Validate appointment date
  │
  ├── Past date ───────────────► ERROR
  │
  ▼
Calculate search window
  │
  ├── Start = appointment date
  │
  ├── End = appointment date + N days
  │
  └── Never exceed 30-day booking window
  │
  ▼
CHECK ORIGINAL APPOINTMENT DATE
  │
  ▼
Priority?
  │
  ├──────── CUSTOM ────────────────┐
  │                                ▼
  │                     Find CUSTOM WAVE
  │                     availability for date
  │                                │
  │                                ▼
  │                     Find free custom slot
  │                                │
  │                         ┌──────┴──────┐
  │                         │             │
  │                       Found        Not found
  │                         │             │
  │                         ▼             │
  │                      RETURN           │
  │                                       │
  └──────── RECURRING ────────────────────┤
                                          ▼
                               Find RECURRING WAVE
                               availability for date
                                          │
                                          ▼
                               Find free recurring slot
                                          │
                                    ┌─────┴─────┐
                                    │           │
                                  Found      Not found
                                    │           │
                                    ▼           │
                                 RETURN         │
                                                ▼
                                   NO SLOT ON ORIGINAL DATE
                                                │
                                                ▼
                                   START SEARCH FROM NEXT DAY
                                                │
                                                ▼
                              ┌──────────────────────────────┐
                              │ For each next date           │
                              │ until search limit           │
                              └──────────────┬───────────────┘
                                             ▼
                                  Check CUSTOM availability
                                             │
                                      ┌──────┴──────┐
                                      │             │
                                    Found        Not found
                                      │             │
                                      ▼             ▼
                                   RETURN     Check RECURRING
                                             availability
                                                   │
                                             ┌─────┴─────┐
                                             │           │
                                           Found      Not found
                                             │           │
                                             ▼           ▼
                                          RETURN     Next date
                                                        │
                                                        ▼
                                                  Continue loop
                                                        │
                                                        ▼
                                              No slot found?
                                                        │
                                                        ▼
                                                      NULL