const { GoogleGenerativeAI } = require('@google/generative-ai');

class AiProcessor {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.client = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
  }

  getModelCandidates(purpose = 'default') {
    if (purpose === 'interview_questions') {
      return [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
      ];
    }

    return [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];
  }

  getModel(modelName) {
    if (!this.client) {
      throw new Error('Gemini API key is not configured');
    }
    return this.client.getGenerativeModel({ model: modelName });
  }

  isRetryableModelError(error) {
    const message = String(error?.message || '');
    const status = error?.status || error?.code;
    return status === 429 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|quota|rate limit|high demand/i.test(message);
  }

  async generateWithModel(modelName, prompt) {
    const model = this.getModel(modelName);
    const result = await model.generateContent(prompt);
    return result?.response?.text?.() || '';
  }

  async runWithModelFallback(prompt, purpose = 'default') {
    const candidates = this.getModelCandidates(purpose);
    let lastError = null;

    for (const modelName of candidates) {
      try {
        const text = await this.generateWithModel(modelName, prompt);
        if (text && text.trim()) {
          return text.trim();
        }
      } catch (error) {
        lastError = error;
        if (!this.isRetryableModelError(error)) {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('No AI response generated');
  }

  extractJSON(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : raw;

    const direct = this.tryParseJSON(candidate);
    if (direct) return direct;

    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const objectSlice = candidate.slice(firstBrace, lastBrace + 1);
      const parsed = this.tryParseJSON(objectSlice);
      if (parsed) return parsed;
    }

    const firstBracket = candidate.indexOf('[');
    const lastBracket = candidate.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const arraySlice = candidate.slice(firstBracket, lastBracket + 1);
      const parsed = this.tryParseJSON(arraySlice);
      if (parsed) return parsed;
    }

    return null;
  }

  tryParseJSON(text) {
    const normalized = String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/,\s*([}\]])/g, '$1');

    try {
      return JSON.parse(normalized);
    } catch (_error) {
      return null;
    }
  }

  extractEmail(text) {
    return String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
  }

  extractPhone(text) {
    const match = String(text || '').match(/(\+?\d[\d\s().-]{8,}\d)/);
    return match ? match[1].replace(/\s+/g, ' ').trim() : null;
  }

  extractLikelyName(text) {
    const lines = String(text || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 12);

    for (const line of lines) {
      if (line.length < 3 || line.length > 60) continue;
      if (/@|\d|curriculum vitae|resume|cv|experience|education/i.test(line)) continue;
      if (/^[A-Za-z][A-Za-z\s.'-]{2,}$/.test(line)) {
        return line.replace(/\s+/g, ' ').trim();
      }
    }

    return null;
  }

  async extractContactInfo(cvText) {
    const safeText = String(cvText || '');
    const fallback = {
      name: this.extractLikelyName(safeText),
      email: this.extractEmail(safeText),
      phone: this.extractPhone(safeText)
    };

    if (fallback.name && fallback.email) {
      return fallback;
    }

    if (!this.client) {
      return fallback;
    }

    try {
      const prompt = `Extract the candidate contact details from this CV text.

Return JSON only with keys: name, email, phone.
Use null when a value is missing.

CV:
${safeText.slice(0, 6000)}`;

      const text = await this.runWithModelFallback(prompt, 'default');
      const parsed = this.extractJSON(text);
      return {
        name: parsed?.name || fallback.name,
        email: parsed?.email || fallback.email,
        phone: parsed?.phone || fallback.phone
      };
    } catch (_error) {
      return fallback;
    }
  }

  async analyzeCandidate(name, position, cvText = '') {
    const prompt = `Analyze this candidate briefly.

Candidate: ${name}
Position: ${position}
CV:
${String(cvText || '').slice(0, 5000)}

Return JSON with keys:
- summary: short paragraph
- highlights: array of 3-5 concise bullet strings`;

    try {
      const text = await this.runWithModelFallback(prompt, 'default');
      const parsed = this.extractJSON(text);
      if (parsed) {
        return {
          summary: parsed.summary || `${name} appears aligned with the ${position} role.`,
          highlights: Array.isArray(parsed.highlights) ? parsed.highlights : []
        };
      }
    } catch (_error) {}

    return {
      summary: `${name} appears aligned with the ${position} role based on the available CV details.`,
      highlights: ['Review candidate CV manually for deeper technical validation.']
    };
  }

  async analyzeProfile(prompt) {
    try {
      const text = await this.runWithModelFallback(prompt, 'default');
      const parsed = this.extractJSON(text);
      if (parsed) return parsed;
    } catch (_error) {}

    return {
      yearsOfExperience: 2,
      techStack: ['JavaScript', 'Node.js', 'React'],
      uniqueStrength: 'Practical implementation ability',
      skillGaps: []
    };
  }

  async generateAssessment(prompt) {
    try {
      const text = await this.runWithModelFallback(prompt, 'default');
      const parsed = this.extractJSON(text);
      if (parsed?.title && parsed?.content) {
        return parsed;
      }
    } catch (_error) {}

    return {
      title: 'Technical Assessment',
      content: `## Objective
Build a practical solution relevant to the target role.

## Requirements
1. Implement the core workflow for the role.
2. Include clear setup instructions.
3. Add notes on architecture and trade-offs.
4. Share your solution via GitHub and send the repository link.

## Submission
Submit within 48 hours by replying with your GitHub repository link.`,
      difficulty: 'Mid-Level',
      techStack: ['JavaScript', 'Node.js'],
      uniqueStrength: 'Problem solving'
    };
  }

  async generateEmail(candidateName, position, round, dateTime, duration = 30) {
    const prompt = `Write a professional recruitment email.

Candidate: ${candidateName}
Position: ${position}
Round: ${round}
Date or deadline: ${dateTime}
Duration or timeframe: ${duration}

Return only the email body text.`;

    try {
      const text = await this.runWithModelFallback(prompt, 'default');
      if (text) return text;
    } catch (_error) {}

    return `Dear ${candidateName},

We would like to invite you for the ${round} stage for the ${position} position at Limi AI.

Details:
- Schedule / deadline: ${dateTime}
- Duration / timeframe: ${duration}

Please let us know if you have any questions.

Best regards,
Limi AI Recruitment Team`;
  }

  async scoreInterview(notes, transcript = '') {
    const prompt = `Score this interview based on the notes and transcript.

Return JSON only with keys:
- overall_score
- technical_score
- communication_score
- problem_solving_score
- culture_fit_score
- strengths (array)
- concerns (array)
- final_recommendation

Notes:
${String(notes || '').slice(0, 5000)}

Transcript:
${String(transcript || '').slice(0, 5000)}`;

    try {
      const text = await this.runWithModelFallback(prompt, 'default');
      const parsed = this.extractJSON(text);
      if (parsed) return parsed;
    } catch (_error) {}

    return {
      overall_score: 3,
      technical_score: 3,
      communication_score: 3,
      problem_solving_score: 3,
      culture_fit_score: 3,
      strengths: ['Interview notes available but AI scoring fallback was used'],
      concerns: [],
      final_recommendation: 'Needs manual review'
    };
  }

  async generateInterviewQuestions(cvText, assessmentText = '') {
    const prompt = `Generate interview questions for this candidate.

Return JSON only with this shape:
{
  "questions": [
    {
      "question": "text",
      "category": "Technical|Behavioral|Project|Assessment Follow-up",
      "purpose": "why this question matters"
    }
  ]
}

Use the CV and assessment to produce 8-12 strong questions.

CV:
${String(cvText || '').slice(0, 7000)}

Assessment:
${String(assessmentText || '').slice(0, 4000)}`;

    try {
      const text = await this.runWithModelFallback(prompt, 'interview_questions');
      const parsed = this.extractJSON(text);
      if (parsed?.questions) return parsed;
    } catch (_error) {}

    return {
      questions: [
        {
          question: 'Walk me through one recent project you are most proud of and the trade-offs you made.',
          category: 'Project',
          purpose: 'Understand ownership, depth, and decision making.'
        },
        {
          question: 'Which part of your previous work best prepares you for this role?',
          category: 'Technical',
          purpose: 'Validate role fit using real experience.'
        },
        {
          question: 'Describe a difficult bug or issue you solved and how you approached it.',
          category: 'Behavioral',
          purpose: 'Assess debugging process and resilience.'
        }
      ]
    };
  }

  async generateComprehensiveSummary(name, cvText) {
    const prompt = `Create a concise structured candidate summary.

Candidate: ${name}
CV:
${String(cvText || '').slice(0, 7000)}

Return JSON only with keys:
- overview
- strengths
- risks
- recommended_focus`;

    try {
      const text = await this.runWithModelFallback(prompt, 'default');
      const parsed = this.extractJSON(text);
      if (parsed) return parsed;
    } catch (_error) {}

    return {
      overview: `${name} has a profile that should be reviewed against the target role.`,
      strengths: ['Candidate summary fallback used'],
      risks: [],
      recommended_focus: ['Validate core technical depth during interview']
    };
  }

  async generateText(prompt) {
    try {
      return await this.runWithModelFallback(prompt, 'default');
    } catch (_error) {
      return '';
    }
  }
}

const aiProcessor = new AiProcessor();

module.exports = { aiProcessor, AiProcessor };
