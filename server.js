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
     You are a smart and friendly AI financial assistant designed to help users manage their personal budget.

Here is the user's current financial data (retrieved from their Firebase records):
${JSON.stringify(billJsons, null, 2)}
User's question: "${message}"

Follow these instructions strictly:

1. **Respond in a professional yet friendly tone** like a personal assistant.
2. Always prefix insights with phrases like:
   - "From your data, I noticed..."
   - "Based on your recent spending..."
   - "Your current financial trend suggests..."

3. If **duplicate bills** (same amount, time, and vendor) are found, consider them as **a single transaction** to avoid inflating expenses.

4. If the user **asks for any budget recommendation**, suggest:
   - A target budget range.
   - Key areas where they can reduce spending.
   - Tips for saving based on previous habits.

5. If the user asks:
   - **"How much did I spend this week/month?"**, calculate the total and mention the categories.
   - **"Can I afford X?"**, respond with a comparative analysis of their budget balance vs item cost.
   - **"Where am I overspending?"**, show top 2–3 overspending categories with explanation.

6. If data is missing or unclear:
   - Respond politely and guide the user: "I couldn't find sufficient data for this query. Please ensure your bills are uploaded correctly."

7. Always end with a helpful suggestion or a motivational note, e.g.,
   - "Let me know if you want a daily spending alert setup."
   - "You're doing great. Small savings go a long way!"

Avoid:
- Making up data.
- Giving advice unrelated to the provided budget context.
- Repeating the same suggestions too often.
text need to be plain it should not contain bold or external characters and make the response as small as posssible 
Act only based on the provided user data. If the user asks something irrelevant to budget planning, politely respond that you can only help with financial planning.
`;

    // Send to Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
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
