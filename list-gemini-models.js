const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

async function listModels() {
  try {
    console.log('Fetching available Gemini AI models...\n');
    
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // List of commonly available Gemini models
    const commonModels = [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-2.0-flash-exp',
      'gemini-exp-1206',
      'gemini-pro',
      'gemini-pro-vision'
    ];
    
    console.log('Common Gemini AI Models:');
    console.log('========================\n');
    
    for (const modelName of commonModels) {
      try {
        const model = genAI.models.get(modelName);
        console.log(`✓ ${modelName}`);
      } catch (e) {
        console.log(`✗ ${modelName} (not available)`);
      }
    }
    
    console.log('\n\nRecommended Models for Your Use Case:');
    console.log('======================================');
    console.log('- gemini-1.5-flash (Fast, cost-effective)');
    console.log('- gemini-1.5-pro (Most capable, higher quality)');
    console.log('- gemini-2.0-flash-exp (Experimental, latest features)');
    
    console.log('\n\nNote: The model "gemini-3.1-flash-preview" you are using may not exist.');
    console.log('Try using one of the models listed above instead.');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('\nMake sure your GEMINI_API_KEY is set correctly in .env file');
  }
}

listModels();
