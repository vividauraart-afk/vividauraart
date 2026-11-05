export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    // 🔥 UPDATED PROMPT: Focuses on ACCURACY, SIMPLICITY, and E-COMMERCE FRIENDLY names.
    const prompt = `You are a highly accurate, practical gift recommendation engine.
The user will describe a person, an item, or an occasion (e.g., "Snake toy", "A gamer", "Coffee lover").
Your task is to return exactly 8 highly accurate, easy-to-find gift ideas that directly match the user's query. 

RULES:
1. Keep the product names short, simple, and natural. (e.g., "Realistic Rubber Snake Toy", "Gaming Mouse", "Coffee Mug Gift Set").
2. Do NOT invent overly luxurious, rare, or impossible-to-find items like "24K gold-plated Oaxaca figurines".
3. The items MUST be easily searchable on Amazon.
4. Return ONLY a valid JSON array of strings. No markdown, no extra text.

Example format: ["Realistic Rubber Snake Toy", "Remote Control Snake", "Plush Snake Stuffed Animal", "Snake Figurine"]`;

    function cleanAndParse(responseText) {
        try {
            let cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const firstBracket = cleanText.indexOf('[');
            const lastBracket = cleanText.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) {
                cleanText = cleanText.substring(firstBracket, lastBracket + 1);
                return JSON.parse(cleanText);
            }
        } catch (e) {
            console.error("Parse error:", e.message);
        }
        return null;
    }

    let gifts = null;
    let engineUsed = "None";

    // --- ENGINE 1: GEMINI ---
    if (!gifts && process.env.GEMINI_API_KEY) {
        try {
            console.log("Trying Gemini...");
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${prompt}\n\nUser Query: ${query}` }] }]
                })
            });
            const data = await geminiRes.json();
            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                gifts = cleanAndParse(data.candidates[0].content.parts[0].text);
                if(gifts) engineUsed = "Gemini";
            }
        } catch (error) { console.error("Gemini failed"); }
    }

    // --- ENGINE 2: OPENROUTER ---
    if (!gifts && process.env.OPENROUTER_API_KEY) {
        try {
            console.log("Trying OpenRouter...");
            const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://vividauraart.vercel.app", 
                    "X-Title": "VividGifts"
                },
                body: JSON.stringify({
                    model: "meta-llama/llama-3.1-8b-instruct",
                    messages: [
                        { role: "system", content: prompt },
                        { role: "user", content: query }
                    ]
                })
            });
            const data = await openRouterRes.json();
            if (data.choices && data.choices[0]) {
                gifts = cleanAndParse(data.choices[0].message.content);
                if(gifts) engineUsed = "OpenRouter";
            }
        } catch (error) { console.error("OpenRouter failed"); }
    }

    // --- ENGINE 3: HUGGING FACE ---
    if (!gifts && process.env.HUGGINGFACE_API_KEY) {
        try {
            console.log("Trying Hugging Face...");
            const hfRes = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    inputs: `<s>[INST] ${prompt} \n\n User query: ${query} [/INST]`,
                    parameters: { max_new_tokens: 300, temperature: 0.7 }
                })
            });
            const hfData = await hfRes.json();
            if (hfData && hfData[0] && hfData[0].generated_text) {
                gifts = cleanAndParse(hfData[0].generated_text);
                if(gifts) engineUsed = "HuggingFace";
            }
        } catch (error) { console.error("HuggingFace failed"); }
    }

    // --- FINAL RESPONSE ---
    if (gifts && Array.isArray(gifts) && gifts.length > 0) {
        return res.status(200).json({ success: true, gifts: gifts.slice(0, 8), source: engineUsed });
    } else {
        return res.status(200).json({ 
            success: false, 
            error: 'All AI Engines failed.', 
            gifts: [] 
        });
    }
}