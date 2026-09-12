# Smart Polling Booth Officer Allocation and Notification System

A full-stack web application for government/election administrations to allocate
officers to polling booths while **preventing officers from being posted in
their own residential locality**, then notifying them by SMS.

- **Frontend:** React + Vite + React Router + Axios
- **Backend:** Node.js + Express.js + MongoDB (Mongoose)
- **Excel:** `xlsx` library for bulk import/export
- **Auth:** JWT + bcrypt

---

## Project Structure

```
Polling-Officer-Allocation-System/
├── backend/
│   ├── config/            # db.js (MongoDB connection)
│   ├── controllers/       # auth, officer, booth, allocation, upload, notification
│   ├── models/            # Officer, Booth, Allocation, Admin, Notification
│   ├── routes/            # API routes per resource
│   ├── services/          # allocationService, addressMatchingService,
│   │                      # excelService, smsService
│   ├── middleware/        # auth, upload (multer), error, validation
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/    # Navbar, Sidebar, tables, ExcelUploader, modals...
    │   ├── pages/         # Login, Dashboard, Officers, Booths, UploadExcel,
    │   │                  # Allocation, Notifications, Reports
    │   ├── services/      # api.js (axios), download.js
    │   ├── context/       # AuthContext.jsx
    │   ├── App.jsx
    │   └── main.jsx
    ├── vite.config.js
    ├── package.json
    └── .env.example
└── README.md
```

---

## Prerequisites

| Tool | Version |
| ---- | ------- |
| Node.js | 18 or higher (tested on 20+/24) |
| npm | 9+ |
| MongoDB | 6+ (Community edition running locally) |

Check with `node --version` and `npm --version`.

---

## 1. Backend Setup

```bash
cd backend
npm install
copy .env.example .env    # Windows
# or:  cp .env.example .env   (Linux / macOS)
```

Edit `.env` and set at minimum:

```ini
MONGODB_URI=mongodb://127.0.0.1:27017/polling_system
JWT_SECRET=<a-long-random-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<a-strong-password>
```

> The default admin is created automatically on the first server start.

Start the API:

```bash
npm run dev      # nodemon, auto-restart on changes
# or
npm start        # node server.js
```

The API runs at **http://localhost:5000**.

### Backend health check

```
GET http://localhost:5000/api/health
```

### SMS provider configuration

`SMS_PROVIDER` accepts two values in `.env`:

| Value  | Behaviour |
| ------ | --------- |
| `mock` | **Default.** Logs the message and simulates delivery (no external call). Perfect for development/demo. |
| `http` | Posts the message to `SMS_PROVIDER_API_URL` as JSON `{ to, message, senderId, apiKey }`. Works with MSG91 / TextLocal style gateways (or a wrapper that maps the fields). |

```ini
SMS_PROVIDER=http
SMS_PROVIDER_API_URL=https://api.your-sms-gateway.com/send
SMS_API_KEY=your-key
SMS_SENDER_ID=ELCION
```

Credentials are always read from environment variables – **never hardcoded**.

Notification statuses persisted in MongoDB: `SEND → PENDING/FAILED → DELIVERED`.

---

## 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The dashboard runs at **http://localhost:5173** and proxies `/api` calls to
`http://localhost:5000` automatically (see `vite.config.js`).

Open the app in your browser and log in with the admin credentials from the
backend `.env` (default `admin` / `Admin@12345`).

Production build:

```bash
npm run build
npm run preview
```
---

## 3. Workflow

1. **Upload Officers Excel** and **Upload Booths Excel** on the *Excel Upload* page
   (drag & drop → validate → preview → import).
2. Visit the **Allocation** page and click **Run Allocation**.
3. Review the allocation table – rows in **red** highlight invalid address
   conflicts (officer locality matches booth locality).
4. **Approve** each allocation.
5. **Send Notification** (SMS) to each approved officer.
6. Download reports on the **Reports** page or from the Allocation page.

---

## Excel Formats

### Officers sheet

| Column | Required |
| ------ | -------- |
| Officer ID | ✅ |
| Officer Name | ✅ |
| Designation | ✅ |
| Mobile Number | ✅ |
| Email | |
| House Number | |
| Street | |
| Village/Locality | ✅ |
| Ward | |
| Mandal | ✅ |
| District | |
| PIN Code | |

### Booths sheet

| Column | Required |
| ------ | -------- |
| Booth ID | ✅ |
| Booth Number | ✅ |
| Booth Name | ✅ |
| Building Name | |
| Street | |
| Village/Locality | ✅ |
| Ward | |
| Mandal | ✅ |
| District | |
| PIN Code | |
| Required Officers | ✅ |

Duplicate IDs, invalid mobile numbers and invalid PIN codes are reported with
their exact row numbers. Duplicate IDs already present in the database are
skipped during import (never overwritten).

Sample templates can be downloaded from the *Excel Upload* page.

---

## Allocation Algorithm (9 steps)

Implemented in `backend/services/allocationService.js` + `addressMatchingService.js`:

1. Group booths by Mandal.
2. Group officers by Mandal.
3. Find booths with available capacity (`requiredOfficers − allocatedOfficerCount`).
4. For each officer, check **every** booth in their Mandal.
5. Reject booths where the officer address is related to the booth locality.
6. Score suitable booths (locality difference, ward difference, available capacity).
7. Allocate the officer to the best scored booth (atomic capacity reservation).
8. Mark officers with no suitable booth as `Unallocated`.
9. Save all allocations to MongoDB.

### Address comparison rules (`addressMatchingService.js`)

- Officer and booth **must be in the same Mandal**.
- **Exact locality/village match → reject.**
- High address similarity (fuzzy `Levenshtein` ratio ≥ 0.75) → reject.
- Address text is normalized (lowercase, trimmed, punctuation stripped) and
  tokenized (common stopwords removed).
- **Multiple matched important tokens** (locality/street/ward) → reject.
- **PIN code alone never rejects** – several booths can share a PIN.
- A weighted conflict score is produced for audit (stored as `addressMatchScore`).

Every officer can hold at most **one** allocation (enforced by a partial unique
index in MongoDB), and booth capacity is never exceeded.
---

## API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/api/auth/login` | Admin login (JWT) |
| GET | `/api/officers` | List / search / filter officers |
| POST | `/api/officers` | Create officer |
| PUT | `/api/officers/:id` | Update officer |
| DELETE | `/api/officers/:id` | Delete officer |
| GET | `/api/booths` | List / search / filter booths |
| POST | `/api/booths` | Create booth |
| PUT | `/api/booths/:id` | Update booth |
| DELETE | `/api/booths/:id` | Delete booth |
| POST | `/api/upload/officers?mode=preview\|commit` | Upload officers Excel |
| POST | `/api/upload/booths?mode=preview\|commit` | Upload booths Excel |
| GET | `/api/upload/templates/:kind` | Download sample template |
| POST | `/api/allocation/run` | Run the allocation algorithm |
| GET | `/api/allocation` | List allocations |
| PUT | `/api/allocation/:id` | Update an allocation |
| POST | `/api/allocation/:id/approve` | Approve an allocation |
| POST | `/api/allocation/:id/reallocate` | Reallocate officer |
| POST | `/api/allocation/:id/cancel` | Cancel an allocation |
| POST | `/api/notifications/send/:allocationId` | Send SMS to the officer |
| GET | `/api/notifications` | List notification statuses |
| GET | `/api/reports/officers-excel` | Officer list report (.xlsx) |
| GET | `/api/reports/booths-excel` | Booth list report (.xlsx) |
| GET | `/api/reports/allocation-excel` | Allocated officers report (.xlsx) |
| GET | `/api/reports/unallocated-officers` | Unallocated officers report (.xlsx) |
| GET | `/api/reports/notifications-excel` | Notification status report (.xlsx) |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/health` | Health check |

All endpoints except `/api/auth/login` and `/api/health` require the JWT header:
`Authorization: Bearer <token>`.

---

## Running the Tests

### 1. Core-Logic Smoke Tests (no MongoDB needed)

The address-matching and allocation-scoring logic is pure and can be verified
without a database. It covers all seven address rules plus the scoring/balance
behaviour of the allocation algorithm:

```bash
cd backend
npm run smoke-test
```

### 2. End-to-End API Test (requires MongoDB + running server)

Exercises the real HTTP stack: login → seed officers/booths → run the
allocation algorithm → verify no same-locality allocation exists → approve an
allocation → send an SMS (mock provider) → reallocate → download the Excel
report → dashboard stats.

```bash
# terminal 1
cd backend
npm start

# terminal 2
cd backend
npm run e2e-test
```

The test is repeatable: it tolerates data left over from previous runs. When
it finishes, wipe its test records (everything named `OFF-E2E-*` /
`BOOTH-E2E-*`) to leave the database pristine:

```bash
npm run cleanup-e2e
```

---

## Security Notes

- Passwords are stored as **bcrypt hashes**.
- All admin routes are protected by **JWT** (24 h expiry).
- Input is validated with `express-validator` (body + URL params).
- Excel rows are validated before insertion (required columns, duplicates, formats).
- Database passwords and SMS credentials live in `.env`/**only** – never exposed.

---

## Environment Variables

- `backend/.env.example` – all backend variables (PORT, MONGODB_URI, JWT_SECRET,
  ADMIN_USERNAME/PASSWORD, SMS_*).
- `frontend/.env.example` – `VITE_API_BASE_URL` (leave blank to use the dev proxy).

Never commit real `.env` files.#   p o l l i n g - o f f i c e r  
 