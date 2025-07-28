import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { db } from './firebase.js'; // Firebase config
import { doc, getDoc } from 'firebase/firestore';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve the HTML test page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Chat endpoint using Gemini 1.5 Flash
app.post('/chat', async (req, res) => {
  try {
    const { message, uid } = req.body;

    if (!message || !uid) {
      return res.status(400).json({ error: 'Message and UID are required' });
    }

    // Fetch user data from Firestore
    const userRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userBills = docSnap.data()?.user_bills || [];

    // Extract all JSON parts from user bills
    const billJsons = userBills.map(bill => bill?.json).filter(Boolean);

    // Combine the user's message and bill data into a single prompt
    const prompt = `
You are an AI budget assistant. Here is the user's past bill data in JSON format:
${JSON.stringify(billJsons, null, 2)}

User's question: "${message}"

Give a helpful, clear financial answer based on their bill data.
`;

    // Send to Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.text(); // just log plain text if JSON fails
      console.error('Gemini API Error:', errorData);
      return res.status(500).json({ error: 'Failed to get response from Gemini' });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';

    res.json({
      success: true,
      response: reply,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Make sure to set your GEMINI_API_KEY in the .env file`);
});