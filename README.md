# IMS Backend (Complete SQLite Version)

A complete, production-ready backend for the Interview Management System using direct SQLite connection (no Prisma ORM). Includes Gmail automation, AI processing, Google Calendar integration, and background workers.

## 🚀 Quick Start

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your credentials (Google OAuth, Gemini API key, JWT secrets)
```

3. **Initialize Database**
```bash
node src/scripts/seed.js
```

4. **Start Server**
```bash
npm start
# or for development with auto-reload
npm run dev
```

## 🔑 Default Admin Credentials

- **Email:** `admin@limi.com`
- **Password:** `admin123`
- ⚠️ **Important:** Change this password after first login!

## 📡 Complete API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout (clear tokens)
- `GET /api/auth/me` - Get current user profile

### Candidates
- `GET /api/candidates` - Get all candidates (pagination, filters)
- `GET /api/candidates/:id` - Get candidate by ID
- `POST /api/candidates` - Create candidate (with CV upload)
- `PUT /api/candidates/:id` - Update candidate
- `PATCH /api/candidates/:id/status` - Update candidate status
- `PATCH /api/candidates/:id/shortlist` - Shortlist candidate
- `PATCH /api/candidates/:id/archive` - Archive candidate
- `DELETE /api/candidates/:id` - Delete candidate
- `GET /api/candidates/metrics` - Get candidate metrics
- `GET /api/candidates/export` - Export candidates to CSV

### Admin Management
- `POST /api/admins` - Create new admin (SUPER_ADMIN only)
- `GET /api/admins` - Get all admins

### Activity Logs
- `GET /api/activity-logs` - Get activity logs (pagination)
- `GET /api/activity-logs/candidate/:id` - Get logs for specific candidate

### AI Features
- `POST /api/ai/candidates/:id/analyze` - AI analyze candidate CV
- `POST /api/ai/candidates/:id/score` - AI score interview
- `POST /api/ai/candidates/generate-email` - Generate email with AI

### Google Integration
- `GET /api/google/auth-url` - Get Google OAuth URL
- `GET /api/google/callback` - OAuth callback (redirect)
- `POST /api/google/revoke` - Revoke Google tokens
- `POST /api/google/fetch-emails` - Manually fetch new emails
- `POST /api/google/mark-all-read` - Mark all previous emails as read
- `POST /api/google/categorize/:id` - Categorize candidate
- `POST /api/google/send-reply` - Send email reply
- `GET /api/google/conversation/:id` - Get email thread
- `POST /api/google/schedule` - Schedule interview (Google Calendar)
- `GET /api/google/calendar/events` - List calendar events
- `GET /api/google/drive/recordings` - List Meet recordings
- `POST /api/google/drive/match-recording` - Link recording to candidate

### Cron Jobs & Health
- `GET /api/health` - API health status
- `GET /api/health/ai` - AI services status
- `GET /api/health/cron` - Cron jobs status
- `GET /api/cron/logs` - Get cron execution logs
- `POST /api/cron/trigger/gmail` - Manually trigger Gmail fetch
- `POST /api/cron/trigger/replies` - Manually trigger reply check

## 🗄️ Database

- **Type:** SQLite
- **Connection:** Direct (no ORM overhead)
- **Location:** `database.sqlite` in project root
- **Schema:** Automatically created on first run

### Tables
- `admins` - Admin users with authentication & Google tokens
- `candidates` - Candidate information, status, CV, interview data
- `messages` - Email conversation history (future use)
- `activity_logs` - Complete audit trail of all actions
- `cron_logs` - Background job execution logs

## 🔧 Environment Variables

See `.env.example` for all required variables:

**Core:**
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Frontend URL (default: http://localhost:3000)

**Database:**
- `DATABASE_PATH` - SQLite database path

**JWT:**
- `JWT_SECRET` - Secret for access tokens
- `JWT_REFRESH_SECRET` - Secret for refresh tokens
- `JWT_EXPIRES_IN` - Access token expiry (default: 1h)
- `JWT_REFRESH_EXPIRES_IN` - Refresh token expiry (default: 7d)

**Google OAuth:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GOOGLE_REDIRECT_URI` - OAuth callback URL

**AI:**
- `GEMINI_API_KEY` - Google Gemini AI API key

## 📁 Project Structure

```
backend-new/
├── src/
│   ├── controllers/       # Request handlers
│   │   ├── auth.controller.js
│   │   ├── candidate.controller.js
│   │   └── admin.controller.js
│   ├── database/          # Database setup
│   │   └── db.js          # SQLite connection & schema
│   ├── middlewares/       # Express middleware
│   │   ├── auth.js        # JWT authentication
│   │   └── upload.js      # File upload (multer)
│   ├── routes/            # API routes
│   │   ├── auth.routes.js
│   │   ├── candidate.routes.js
│   │   ├── admin.routes.js
│   │   ├── activityLog.routes.js
│   │   ├── ai.routes.js
│   │   └── google.routes.js
│   ├── services/          # Business logic
│   │   ├── auth.service.js
│   │   ├── candidate.service.js
│   │   ├── admin.service.js
│   │   ├── activityLog.service.js
│   │   └── cron.service.js
│   ├── utils/             # Utilities
│   │   ├── jwt.js
│   │   ├── uuid.js
│   │   └── apiResponse.js
│   ├── workers/           # Background workers
│   │   ├── ai.processor.js    # AI CV analysis & scoring
│   │   ├── gmail.worker.js    # Gmail automation
│   │   └── drive.worker.js    # Drive recordings
│   ├── scripts/           # Utility scripts
│   │   └── seed.js
│   └── server.js          # Main entry point
├── uploads/               # File storage (CVs)
├── database.sqlite        # SQLite database
├── .env                   # Environment variables
├── package.json
└── README.md
```

## ✨ Complete Features

### Core Features
- ✅ JWT Authentication with refresh tokens
- ✅ Role-based access control (SUPER_ADMIN, HR_ADMIN, INTERVIEWER)
- ✅ Candidate CRUD operations with advanced filtering
- ✅ File upload (CV handling with multer)
- ✅ Pagination and search
- ✅ Metrics and analytics
- ✅ CSV export
- ✅ Complete activity logging & audit trail

### Google Integration
- ✅ Google OAuth 2.0 authentication
- ✅ Gmail worker - Auto-fetch emails with CVs
- ✅ Email read/unread status tracking
- ✅ Mark all previous emails as read
- ✅ Auto-create candidates from CV attachments
- ✅ Email conversation threading
- ✅ Send email replies
- ✅ Google Calendar integration
- ✅ Schedule interviews with Google Meet
- ✅ Google Drive - List Meet recordings
- ✅ Link recordings to candidates

### AI Features
- ✅ AI-powered CV parsing (PDF text extraction)
- ✅ Contact information extraction from CVs
- ✅ Candidate analysis and highlights
- ✅ Interview scoring and feedback
- ✅ Email generation
- ✅ Position detection from CV content

### Background Workers
- ✅ Gmail worker - Fetch new emails every 5 minutes
- ✅ Assessment reply checker - Every 10 minutes
- ✅ Health check logging - Every hour
- ✅ Drive worker - Scan for Meet recordings
- ✅ Cron job management and logging

### Security & Performance
- ✅ CORS configuration
- ✅ Cookie-based authentication
- ✅ Request size limits
- ✅ Error handling middleware
- ✅ Direct SQLite (no ORM overhead)

## 🔄 Gmail Worker Features

The Gmail worker automatically:
1. **Fetches unread emails** with attachments every 5 minutes
2. **Parses PDF CVs** and extracts text
3. **Uses AI** to extract contact info (name, email, phone)
4. **Auto-detects position** from email content
5. **Creates candidates** automatically
6. **Marks emails as read** after processing
7. **Tracks assessment submissions** and updates candidate status
8. **Supports manual triggers** via API endpoints

### Mark All Emails as Read
Use `POST /api/google/mark-all-read` to mark all previous emails as read, so the worker only fetches new unread emails going forward.

## 🤖 AI Processing

The AI processor uses Google Gemini to:
- Extract contact information from CVs
- Analyze candidate qualifications
- Generate key highlights
- Score interviews based on notes/transcripts
- Generate professional emails
- Detect desired role from CV

## ⏰ Cron Jobs

Background tasks run automatically:
- **Gmail Fetch:** Every 5 minutes
- **Reply Check:** Every 10 minutes  
- **Health Check:** Every hour

Manual triggers available via API endpoints.

## 🚦 Getting Started Workflow

1. **Start the server** - `npm start`
2. **Login** with default admin credentials
3. **Connect Google OAuth** - Visit `/api/google/auth-url`
4. **Mark old emails as read** - `POST /api/google/mark-all-read`
5. **Trigger Gmail fetch** - `POST /api/cron/trigger/gmail`
6. **View candidates** - `GET /api/candidates`
7. **Schedule interviews** - `POST /api/google/schedule`
8. **AI analysis** - `POST /api/ai/candidates/:id/analyze`

## 📊 Monitoring

- Check cron status: `GET /api/health/cron`
- View cron logs: `GET /api/cron/logs`
- Check AI status: `GET /api/health/ai`
- View activity logs: `GET /api/activity-logs`

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in development mode (with nodemon)
npm run dev

# Run in production mode
npm start

# Seed database
node src/scripts/seed.js
