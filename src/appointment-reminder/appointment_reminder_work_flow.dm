Cron Job (Every 1 Minute)
          │
          ▼
Get current time
          │
          ▼
Calculate reminder window
(now + 1 hour) → (now + 1 hour + 5 min)
          │
          ▼
Fetch BOOKED appointments
          │
          ▼
For each appointment
          │
          ├── Patient exists? ── No ──► Skip
          │
          ├── Doctor exists? ─── No ──► Skip
          │
          ├── Appointment time exists?
          │                    No ──► Skip
          │
          ▼
Combine appointment date + start time
          │
          ▼
Is appointment inside
reminder window?
          │
       No │        Yes
          │         │
        Skip        ▼
              Reminder already exists?
                    │
              Yes ──┴──► Skip
                    │ No
                    ▼
          Check scheduling type
             │             │
          STREAM         WAVE
             │             │
             ▼             ▼
       Create reminder notification
             │
             ▼
       Save notification
             │
             ▼
       Notification saved successfully?
             │
             ▼
       Send reminder email
             │
             ▼
            Done