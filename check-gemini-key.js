require('dotenv').config();

console.log('='.repeat(60));
console.log('GEMINI API KEY CHECK');
console.log('='.repeat(60));
console.log('');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.log('❌ GEMINI_API_KEY is NOT set in .env file');
  console.log('');
  console.log('Please add to .env:');
  console.log('GEMINI_API_KEY=your_api_key_here');
} else {
  console.log('✅ GEMINI_API_KEY is set');
  console.log('');
  console.log('Key preview:', apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4));
  console.log('Key length:', apiKey.length, 'characters');
  
  // Test the key with a simple API call
  console.log('');
  console.log('Testing API key with Google AI...');
  
  const { GoogleGenAI } = require('@google/genai');
  
  (async () => {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash-preview',
        contents: 'Say "Hello" in JSON format: {"message": "Hello"}'
      });
      
      console.log('✅ API key is VALID and working!');
      console.log('Response:', response.text.substring(0, 100));
    } catch (error) {
      console.log('❌ API key test FAILED');
      console.log('Error:', error.message);
      
      if (error.message.includes('API key')) {
        console.log('');
        console.log('The API key appears to be invalid or expired.');
        console.log('Please check your GEMINI_API_KEY in .env file.');
      }
    }
    
    console.log('');
    console.log('='.repeat(60));
  })();
}
