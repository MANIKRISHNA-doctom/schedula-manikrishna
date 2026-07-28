1.Appointment Booking Flow

Patient
   ↓
Select Doctor
   ↓
Select Date
   ↓
Fetch Available Slots
   ↓
Select Slot
   ↓
Validate Patient & Doctor
   ↓
Check Slot Availability
   ↓
Already Booked?
  ↙       ↘
 YES       NO
 ↓          ↓
Error    Create Appointment
            ↓
       Mark Slot Booked
            ↓
       Return Appointment



2.Patient Appointment View Flow

Patient
   ↓
GET /appointment/my
   ↓
Validate Patient
   ↓
Find Patient Appointments
   ↓
Appointments Found?
  ↙       ↘
 NO        YES
 ↓          ↓
Empty    Fetch Doctor
Response  + Date + Slot
              ↓
       Return Appointments



3.Doctor Appointment View Flow

Doctor
   ↓
GET /doctor/appointments
   ↓
Validate Doctor
   ↓
Find Doctor Appointments
   ↓
Appointments Found?
  ↙       ↘
 NO        YES
 ↓          ↓
Empty    Fetch Patient
Response + Date + Slot
              ↓
       Return Appointments



4.Appointment Cancellation Flow

Patient
   ↓
PATCH /appointment/:id/cancel
   ↓
Validate Patient
   ↓
Find Appointment
   ↓
Check Appointment Owner
   ↓
Already Cancelled?
  ↙          ↘
 YES          NO
 ↓             ↓
Error      Check Past Date
                ↓
          Past Appointment?
             ↙       ↘
           YES        NO
            ↓          ↓
          Error    Cancel Appointment
                       ↓
                 Release Slot /
                 Update Availability
                       ↓
                 Status = CANCELLED
                       ↓
                Return Response

