# AI Features & Scheduling Guide

## Overview
This guide explains all the AI-powered features and scheduling capabilities in the IMS system.

---

## 🤖 AI Features

### 1. **AI Analyze Button**
**What it does:**
- Provides a quick analysis of the candidate based on their CV
- Extracts key highlights, skills, experience, and potential concerns
- Stores analysis in `key_highlights` field

**API Endpoint:**
```
POST /api/ai/:id/analyze
```

**Response:**
```json
{
  "highlights": {
    "top_skills": ["React", "Node.js", "Python"],
    "years_of_experience": 5,
    "last_company": "Tech Corp",
    "education_summary": "BS Computer Science",
    "seniority_level": "Senior",
    "risk_flags": [],
    "desired_role": "Full Stack Developer"
  },
  "summary": "Strong full-stack developer with 5 years experience"
}
```

---

### 2. **Generate AI Summary (NEW)**
**What it does:**
- Generates a **comprehensive CV analysis** with:
  - Professional overview
  - Strengths and weaknesses
  - Top skills
  - **Suggested roles with fit scores**
  - Overall assessment
  - Interview focus areas
  - Red flags (if any)

**API Endpoint:**
```
POST /api/ai/:id/generate-summary
```

**Response:**
```json
{
  "overview": "Experienced full-stack developer with strong React and Node.js skills...",
  "strengths": [
    "Strong technical foundation in modern web technologies",
    "Proven track record at reputable companies",
    "Good problem-solving abilities"
  ],
  "weaknesses": [
    "Limited experience with cloud infrastructure",
    "No management experience"
  ],
  "top_skills": ["React", "Node.js", "TypeScript", "PostgreSQL", "AWS"],
  "years_of_experience": 5,
  "education": "BS Computer Science, MIT",
  "last_company": "Tech Corp",
  "seniority_level": "Senior",
  "suggested_roles": [
    {
      "role": "Senior Full Stack Developer",
      "fit_score": 92,
      "reasoning": "Perfect match for technical skills and experience level"
    },
    {
      "role": "Frontend Team Lead",
      "fit_score": 78,
      "reasoning": "Strong frontend skills, could grow into leadership"
    },
    {
      "role": "Backend Engineer",
      "fit_score": 85,
      "reasoning": "Solid Node.js and database experience"
    }
  ],
  "overall_assessment": "Excellent candidate for senior developer roles. Strong technical foundation with room to grow into leadership positions.",
  "interview_focus_areas": [
    "System design capabilities",
    "Team collaboration experience",
    "Cloud infrastructure knowledge"
  ],
  "red_flags": []
}
```

**Storage:**
- Saved in `candidates.ai_summary` field as JSON string
- Can be retrieved and displayed in the frontend

---

### 3. **View CV**
**What it does:**
- Retrieves the CV text content for viewing/analysis

**API Endpoint:**
```
GET /api/ai/:id/view-cv
```

**Response:**
```json
{
  "cvText": "Full CV text content...",
  "fileName": "john_doe_cv.pdf",
  "candidateName": "John Doe"
}
```

---

## 📅 Scheduling Features

### **Schedule Interview Button**
**What it should do (Frontend Implementation Needed):**

1. **Click Schedule Button** on candidate card
2. **Auto-generate email** using AI:
   ```
   POST /api/ai/generate-email
   Body: {
     "candidateName": "John Doe",
     "position": "Senior Developer",
     "round": "Technical Interview",
     "dateTime": "March 5, 2026 at 2:00 PM"
   }
   ```

3. **Create Google Calendar Event**:
   ```
   POST /api/google/schedule
   Body: {
     "candidateId": "uuid",
     "interviewDate": "2026-03-05T14:00:00",
     "duration": 60,
     "interviewerEmail": "interviewer@limi.com",
     "notes": "Technical interview round"
   }
   ```

4. **Send Email** with calendar invite
5. **Update candidate** status to SCHEDULED

---

## 🎯 Frontend Implementation Guide

### **Candidate Card Enhancements Needed:**

```tsx
// 1. Add Schedule Button
<button onClick={handleSchedule}>
  <Calendar /> Schedule Interview
</button>

// 2. Add AI Summary Button
<button onClick={handleGenerateSummary}>
  <Sparkles /> Generate AI Summary
</button>

// 3. Add View CV Button
<button onClick={handleViewCV}>
  <FileText /> View CV
</button>

// 4. Add Expandable Summary Section
{candidate.ai_summary && (
  <details className="mt-4">
    <summary className="cursor-pointer font-semibold">
      AI Analysis Summary
    </summary>
    <div className="mt-2 space-y-3">
      <p className="text-sm">{summary.overview}</p>
      
      <div>
        <h4 className="font-medium">Suggested Roles:</h4>
        {summary.suggested_roles.map(role => (
          <div key={role.role} className="flex items-center gap-2">
            <span className="font-medium">{role.role}</span>
            <span className="text-emerald">{role.fit_score}% fit</span>
            <p className="text-xs text-gray-500">{role.reasoning}</p>
          </div>
        ))}
      </div>

      <div>
        <h4 className="font-medium">Strengths:</h4>
        <ul>
          {summary.strengths.map(s => <li key={s}>✓ {s}</li>)}
        </ul>
      </div>

      <div>
        <h4 className="font-medium">Interview Focus:</h4>
        <ul>
          {summary.interview_focus_areas.map(a => <li key={a}>{a}</li>)}
        </ul>
      </div>
    </div>
  </details>
)}
```

---

## 📊 Database Schema

### **Candidates Table - AI Fields:**
```sql
ai_score REAL                -- Overall interview score (1-5)
ai_feedback TEXT             -- Interview feedback from AI
key_highlights TEXT          -- JSON: Quick analysis highlights
ai_summary TEXT              -- JSON: Comprehensive CV summary (NEW)
```

---

## 🔄 Workflow Example

### **Complete Hiring Workflow:**

1. **Candidate applies** → CV uploaded
2. **Click "Generate AI Summary"** → Comprehensive analysis created
3. **Review suggested roles** → Decide best fit
4. **Click "Schedule Interview"** → Auto-generates email + calendar event
5. **Interview conducted** → Notes added
6. **Click "AI Score"** → Interview performance analyzed
7. **Decision made** → Shortlist or Reject

---

## 🚀 API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/:id/analyze` | POST | Quick CV analysis |
| `/api/ai/:id/generate-summary` | POST | Comprehensive summary with role suggestions |
| `/api/ai/:id/view-cv` | GET | View CV text content |
| `/api/ai/:id/score` | POST | Score interview performance |
| `/api/ai/generate-email` | POST | Generate interview invitation email |
| `/api/google/schedule` | POST | Create Google Calendar event |

---

## 💡 Key Benefits

1. **AI Summary** provides role suggestions with fit scores
2. **Automated scheduling** saves time
3. **CV viewer** for quick reference
4. **Comprehensive analysis** helps make better hiring decisions
5. **All data stored** in database for future reference

---

## 🎨 Frontend TODO

- [ ] Add Schedule button to candidate cards
- [ ] Create scheduling modal with date/time picker
- [ ] Add AI Summary expandable section
- [ ] Add CV viewer modal
- [ ] Show suggested roles with fit scores
- [ ] Display strengths/weaknesses/focus areas
- [ ] Integrate with Google Calendar API
- [ ] Auto-send emails after scheduling

