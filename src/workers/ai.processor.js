const { GoogleGenAI } = require('@google/genai');

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenAI({ apiKey });
}

function extractJSON(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  let extracted = match ? (match[1] || match[0]).trim() : text.trim();
  
  // More aggressive sanitization: replace all control characters with spaces
  // This includes newlines, tabs, and other problematic characters
  extracted = extracted.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, ' ');
  
  // Clean up multiple spaces
  extracted = extracted.replace(/\s+/g, ' ');
  
  return extracted;
}

class AiProcessor {
  async parseCv(cvText) {
    try {
      const ai = getAI();
      const prompt = `Analyze the following CV/resume text and extract structured data. Return ONLY valid JSON with this exact schema:
{
  "top_skills": ["skill1", "skill2", "skill3"],
  "years_of_experience": number,
  "last_company": "company name",
  "education_summary": "brief education summary",
  "seniority_level": "Junior" | "Mid" | "Senior" | "Lead" | "Principal",
  "risk_flags": ["flag1"] or []
}

Risk flags examples: "Short tenure at last role", "Frequent job changes", "Employment gap", "No relevant experience"

CV Text:
${cvText.slice(0, 8000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      const json = extractJSON(response.text);
      const parsed = JSON.parse(json);
      console.log('[AiProcessor] CV parsed successfully');
      return parsed;
    } catch (error) {
      console.error('[AiProcessor] CV parse error:', error);
      return null;
    }
  }

  async extractContactInfo(cvText) {
    try {
      const ai = getAI();
      const prompt = `Extract the candidate's contact information from this CV. Return ONLY valid JSON:
{
  "name": "Full Name from CV",
  "email": "email@example.com",
  "phone": "phone number if available"
}

CV Text:
${cvText.slice(0, 2000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      const json = extractJSON(response.text);
      const parsed = JSON.parse(json);
      console.log('[AiProcessor] Extracted contact:', parsed.name, parsed.email);
      return parsed;
    } catch (error) {
      console.error('[AiProcessor] Contact extraction error:', error);
      return null;
    }
  }

  async analyzeCandidate(name, position, cvText) {
    try {
      const ai = getAI();
      const prompt = `Provide a brief candidate assessment for ${name} applying for ${position}.${cvText ? `\n\nCV:\n${cvText.slice(0, 4000)}` : ''}

Return ONLY valid JSON:
{
  "highlights": {
    "top_skills": ["skill1", "skill2", "skill3"],
    "years_of_experience": number,
    "last_company": "company",
    "education_summary": "brief",
    "seniority_level": "Junior|Mid|Senior|Lead",
    "risk_flags": [],
    "desired_role": "role from CV if mentioned"
  },
  "summary": "1-2 sentence assessment"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      const json = extractJSON(response.text);
      return JSON.parse(json);
    } catch (error) {
      console.error('[AiProcessor] Analyze error:', error);
      return { highlights: null, summary: 'AI analysis unavailable' };
    }
  }

  async generateEmail(candidateName, position, round, dateTime, duration = 30) {
    try {
      const ai = getAI();
      const prompt = `Generate a professional, warm, and concise interview invitation email. Do NOT include subject line. Return only the email body text.

Candidate: ${candidateName}
Position: ${position}
Interview Round: ${round}
Date & Time: ${dateTime}
Duration: ${duration} minutes
Company: Limi

Keep it under 150 words. Professional but friendly tone. Make sure to mention the interview duration.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      return response.text.trim();
    } catch (error) {
      console.error('[AiProcessor] Email generation error:', error);
      return `Dear ${candidateName},\n\nWe would like to invite you for a ${round} interview for the ${position} position at Limi.\n\nDate & Time: ${dateTime}\nDuration: ${duration} minutes\n\nPlease confirm your availability.\n\nBest regards,\nLimi Recruitment Team`;
    }
  }

  async generateComprehensiveSummary(candidateName, cvText) {
    try {
      const ai = getAI();
      const prompt = `CRITICAL: You MUST analyze ONLY the information present in the CV text below. DO NOT make up or hallucinate any information. If something is not mentioned in the CV, do not include it.

Analyze this CV comprehensively and provide a detailed professional summary based STRICTLY on the CV content. Return ONLY valid JSON:

{
  "overview": "2-3 sentence professional overview based ONLY on what's in the CV",
  "strengths": ["strength1 from CV", "strength2 from CV", "strength3 from CV"],
  "weaknesses": ["potential gap or concern based on CV", "another concern if any"],
  "top_skills": ["skill1 from CV", "skill2 from CV", "skill3 from CV", "skill4 from CV", "skill5 from CV"],
  "years_of_experience": number (calculate from work history in CV),
  "education": "education summary from CV",
  "last_company": "most recent company name from CV",
  "seniority_level": "Junior|Mid-Level|Senior|Lead|Principal" (based on experience years and roles),
  "suggested_roles": [
    {
      "role": "Role Title based on CV skills and experience",
      "fit_score": 85,
      "reasoning": "Why this role fits based on CV"
    },
    {
      "role": "Alternative Role based on CV",
      "fit_score": 75,
      "reasoning": "Why this could work based on CV"
    }
  ],
  "overall_assessment": "Detailed 2-3 sentence assessment based ONLY on CV content",
  "interview_focus_areas": ["area1 from CV", "area2 from CV", "area3 from CV"],
  "red_flags": ["flag1 if any found in CV"] or []
}

IMPORTANT RULES:
1. Extract skills ONLY from the CV - do not invent skills
2. Calculate experience years from the work history dates in the CV
3. Use the actual company names mentioned in the CV
4. Base suggested roles on the actual technologies and experience in the CV
5. If the CV mentions React/Next.js/Node.js, suggest Full Stack/Frontend roles, NOT mobile development
6. If the CV mentions Flutter/Dart, suggest Mobile Development roles
7. DO NOT mix up technologies - be precise about what's actually in the CV

Candidate Name: ${candidateName}

CV Text:
${cvText.slice(0, 12000)}

Remember: ONLY use information from the CV text above. Do not hallucinate or make assumptions.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      const json = extractJSON(response.text);
      const parsed = JSON.parse(json);
      console.log('[AiProcessor] Comprehensive summary generated for:', candidateName);
      return parsed;
    } catch (error) {
      console.error('[AiProcessor] Summary generation error:', error);
      return null;
    }
  }

  async scoreInterview(notes, transcript) {
    try {
      const ai = getAI();
      const prompt = `Analyze this interview and provide a detailed scoring. Return ONLY valid JSON:

{
  "overall_score": number (1-5, can be decimal like 4.2),
  "technical_score": number (1-5),
  "communication_score": number (1-5),
  "culture_fit_score": number (1-5),
  "final_recommendation": "Strong Hire|Hire|Maybe|No Hire|Strong No Hire",
  "reasoning": "Brief explanation of the scores and recommendation",
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"] or []
}

Interview Notes:
${notes}

${transcript ? `\nInterview Transcript:\n${transcript.slice(0, 8000)}` : ''}

Provide honest, balanced assessment based on the interview content.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      const json = extractJSON(response.text);
      const parsed = JSON.parse(json);
      console.log('[AiProcessor] Interview scored:', parsed.overall_score);
      return parsed;
    } catch (error) {
      console.error('[AiProcessor] Score interview error:', error);
      return null;
    }
  }

  async generateText(prompt) {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      return response.text.trim();
    } catch (error) {
      console.error('[AiProcessor] Text generation error:', error);
      throw error;
    }
  }

  async generateInterviewQuestions(cvText, assessmentText) {
    try {
      const ai = getAI();
      const prompt = `You are an expert technical interviewer. Generate comprehensive interview questions based on the candidate's CV and the assessment they completed.

CV Content:
${cvText.slice(0, 8000)}

Assessment Content:
${assessmentText ? assessmentText.slice(0, 4000) : 'No assessment content available'}

CRITICAL REQUIREMENTS:
1. ALL questions and answers MUST be in ROMAN URDU/ENGLISH MIX (Hinglish style)
2. Use casual Pakistani English with Urdu words mixed in naturally
3. Example: "Yaar, Node.js mein event loop kaise kaam karta hai? Asynchronous operations ko handle karne ka kya mechanism hai?"
4. Expected answers should also be in Roman Urdu/English mix with technical terms in English

QUESTION DISTRIBUTION (EXACTLY 15 QUESTIONS):
- 8 Conceptual/Technical questions from CV (cover technologies, frameworks, concepts mentioned)
- 4 Questions from Assessment topics (if assessment available)
- 3 Logic Testing/Problem-Solving scenarios (like classic puzzles)

LOGIC TESTING REQUIREMENTS - PRACTICAL WORD PROBLEMS:
- Use PRACTICAL, REAL-WORLD math/logic problems (NO complex formulas or theoretical puzzles)
- Focus on everyday scenarios that test logical thinking and basic math
- Examples: jug filling problems, tap flow rates, time/distance, work rate problems
- Should be solvable with simple arithmetic and logical reasoning
- Difficulty: Medium level - should take 3-5 minutes to solve

EXAMPLES OF GOOD LOGIC PROBLEMS:
- "Tumhare paas ek 5 liter ka jug hai aur ek 7 liter ka jug hai. Kaise exactly 4 liters pani measure karoge? Step by step batao."
- "Ek tap se 4 liters pani 1 ghante mein bharta hai. Agar 5 taps khol diye jaye to half hour mein kitna pani bhrega? Calculation dikhao."
- "Ek train 60 km/hr ki speed se chal rahi hai. Agar ye 180 km ka distance cover karna hai aur beech mein 30 minutes ka stop hai, to total kitna time lagega?"
- "3 workers ek kaam ko 6 days mein complete karte hain. Agar 2 workers ho to kitne days lagenge? Aur agar 9 workers ho to kitne days?"
- "Ek dukaan mein ek item ki original price 1000 rupees hai. Pehle 20% discount diya, phir us discounted price pe 10% discount aur diya. Final price kya hogi? Step by step calculate karo."

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "question": "Question in Roman Urdu/English mix",
      "category": "CV-Conceptual|Assessment-Based|Logic-Testing|Technical-Fundamentals|Technical-Advanced",
      "difficulty": "Easy|Medium|Hard",
      "expected_answer": "DETAILED answer in Roman Urdu/English mix covering: 1) Core concept/definition, 2) Key technical points, 3) Best practices, 4) Real-world application. Minimum 4-6 sentences with technical depth. Technical terms English mein rakhein.",
      "follow_up": "Optional follow-up in Roman Urdu/English mix"
    }
  ],
  "interview_tips": [
    "Tip in Roman Urdu/English mix for interviewer",
    "Another actionable tip in Roman Urdu/English mix"
  ]
}

EXAMPLE GOOD QUESTION (Roman Urdu/English Mix):
{
  "question": "Bhai, Node.js mein event loop ka concept samjhao aur ye asynchronous operations ko kaise handle karta hai?",
  "category": "CV-Conceptual",
  "difficulty": "Medium",
  "expected_answer": "Dekho, Node.js ka event loop ek single-threaded mechanism hai jo asynchronous operations handle karta hai. Ye different phases mein kaam karta hai: timers, pending callbacks, idle/prepare, poll, check, aur close callbacks. Jab bhi koi async operation jaise I/O ya timers initiate hoti hai, wo system kernel ya thread pool ko offload ho jati hai aur callbacks queue mein chali jati hain. Event loop continuously in queues ko check karta rehta hai aur jab operations complete hoti hain tab callbacks execute karta hai. Is non-blocking architecture ki wajah se Node.js thousands of concurrent connections efficiently handle kar sakta hai bina har request ke liye naye threads banaye.",
  "follow_up": "Agar tum event loop mein CPU-intensive synchronous operation perform karo to kya hoga?"
}

EXAMPLE LOGIC TESTING QUESTION:
{
  "question": "Tumhare paas ek 5 liter ka jug hai aur ek 3 liter ka jug hai. Kaise exactly 4 liters pani measure karoge? Step by step batao.",
  "category": "Logic-Testing",
  "difficulty": "Medium",
  "expected_answer": "Dekho, ye problem step by step solve karte hain: Step 1: Pehle 5L jug ko completely bharo (5L jug = 5L, 3L jug = 0L). Step 2: Ab 5L jug se 3L jug mein pani daalo jab tak 3L jug full na ho jaye (5L jug = 2L, 3L jug = 3L). Step 3: 3L jug ko completely empty karo (5L jug = 2L, 3L jug = 0L). Step 4: Ab 5L jug ke 2L pani ko 3L jug mein daalo (5L jug = 0L, 3L jug = 2L). Step 5: Phir se 5L jug ko completely bharo (5L jug = 5L, 3L jug = 2L). Step 6: Ab 5L jug se 3L jug mein pani daalo jab tak 3L jug full na ho (sirf 1L space hai 3L jug mein, to 5L jug se 1L niklega). Final result: 5L jug mein exactly 4 liters pani bach jayega! Is tarah tum different capacities ke jugs use karke specific measurements achieve kar sakte ho.",
  "follow_up": "Agar tumhare paas 7L aur 4L ke jugs hote to 5L kaise measure karoge?"
}

Generate EXACTLY 15 questions:
- 8 CV-Conceptual (mix of Easy, Medium, Hard based on candidate's tech stack)
- 4 Assessment-Based (related to assessment topics if available, otherwise general technical)
- 3 Logic-Testing (practical word problems - jug filling, tap rates, time/distance, work rate, etc.)

ALL questions and answers in Roman Urdu/English mix. Technical terms English mein, explanations Hinglish mein.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      
      console.log('[AiProcessor] Raw AI response length:', response.text.length);
      
      const json = extractJSON(response.text);
      console.log('[AiProcessor] Extracted JSON length:', json.length);
      console.log('[AiProcessor] First 500 chars:', json.substring(0, 500));
      console.log('[AiProcessor] Last 500 chars:', json.substring(json.length - 500));
      
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch (parseError) {
        console.error('[AiProcessor] JSON parse failed, attempting to fix...');
        console.error('[AiProcessor] Parse error:', parseError.message);
        
        // Try to fix common JSON issues
        let fixedJson = json
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
          .replace(/:\s*'([^']*)'/g, ':"$1"'); // Replace single quotes with double quotes
        
        try {
          parsed = JSON.parse(fixedJson);
          console.log('[AiProcessor] JSON fixed successfully!');
        } catch (fixError) {
          console.error('[AiProcessor] Could not fix JSON:', fixError.message);
          console.error('[AiProcessor] Problematic JSON around error position:', json.substring(21600, 21700));
          return null;
        }
      }
      
      console.log('[AiProcessor] Generated', parsed.questions?.length || 0, 'interview questions');
      return parsed;
    } catch (error) {
      console.error('[AiProcessor] Interview questions generation error:', error);
      return null;
    }
  }
}

const aiProcessor = new AiProcessor();

module.exports = { aiProcessor, AiProcessor };
