1. Stream Scheduling Flow

   Doctor
   │
   ▼
Select STREAM Scheduling
   │
   ▼
Set Availability
(Start Time, End Time,
Duration, Buffer Time)
   │
   ▼
Generate Time Slots
   │
   ▼
Patient Fetches Slots
   │
   ▼
Patient Selects Slot
   │
   ▼
Validate Slot Availability
   │
   ▼
Appointment Booked


2. Wave Scheduling Flow

   Doctor
   │
   ▼
Select WAVE Scheduling
   │
   ▼
Set Availability
(Start Time, End Time,
Max Capacity)
   │
   ▼
Create Appointment Window
   │
   ▼
Patient Fetches Window
   │
   ▼
Patient Books Appointment
   │
   ▼
Check Capacity
   │
   ▼
Assign Token Number
   │
   ▼
Appointment Booked

3. Appointment Booking Flow

Patient
   │
   ▼
Select Doctor
   │
   ▼
Choose Date
   │
   ▼
Fetch Availability
   │
   ▼
STREAM ? ───────────────► WAVE ?
   │                         │
Choose Slot            Join Wave
   │                         │
Validate                Check Capacity
   │                         │
Book Slot             Assign Token
   │                         │
   └──────────────┬──────────┘
                  │
                  ▼
         Appointment Created
         

  4. Overall Scheduling Flow

     Doctor Login
      │
      ▼
Create Availability
      │
      ▼
Select Scheduling Type
      │
      ├──────────────┐
      ▼              ▼
   STREAM          WAVE
      │              │
Generate Slots   Set Capacity
      │              │
      └──────┬───────┘
             ▼
Patient Views Availability
             │
             ▼
Patient Books Appointment
             │
             ▼
Appointment Confirmed
