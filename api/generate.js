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

    // 🔥 AI-യോട് കൃത്യമായി പറയുന്നു, എക്സ്ട്രാ വാക്കുകൾ ചേർക്കരുത് എന്ന്.
    const prompt = `You are a strict search assistant.
The user will provide a search term (e.g., "Snake", "Teddy", "Watch", "Chocolate").
Your ONLY task is to return exactly 8 simple variations of that EXACT item.

STRICT RULES:
1. Every single suggestion MUST contain the exact core word the user typed.
2. Do NOT invent new items or add unrelated words (e.g., If user says "Snake", do NOT say "Serpent" or "Reptile").
3. Do NOT use words like "Premium", "Luxury", or "Exclusive".
4. The items must be affordable and easily searchable on Amazon.
5. Return ONLY a valid JSON array of strings. No markdown, no extra text.

Example for "Snake": ["Snake", "Snake Toy", "Snake Gift", "Snake Set", "Toy Snake", "Rubber Snake", "Plastic Snake", "Snake Pack"]`;

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

    // 🔥 THE FILTRATION SYSTEM (JavaScript Rules)
    function filterGifts(gifts, userQuery) {
        if (!gifts || !Array.isArray(gifts)) return [];
        
        const lowerQuery = userQuery.toLowerCase().split(',')[0].trim(); // ബജറ്റ് ഒഴിവാക്കി വെറും വാക്ക് എടുക്കാൻ
        
        return gifts.filter(gift => {
            const lowerGift = gift.toLowerCase();
            
            // Rule 1: യൂസർ അടിച്ച വാക്ക് അതിൽ ഉണ്ടായിരിക്കണം
            if (!lowerGift.includes(lowerQuery)) return false;
            
            // Rule 2: "Premium", "Luxury" തുടങ്ങിയ വാക്കുകൾ പാടില്ല
            const forbiddenWords = ["premium", "luxury", "exclusive", "deluxe"];
            if (forbiddenWords.some(word => lowerGift.includes(word))) return false;
            
            // Rule 3: വളരെ നീളം കൂടിയ പേരുകൾ പാടില്ല (Max 40 characters)
            if (gift.length > 40) return false;

            return true;
        });
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
                const rawGifts = cleanAndParse(data.candidates[0].content.parts[0].text);
                // 🔥 Filter ചെയ്യുന്നു
                gifts = filterGifts(rawGifts, query);
                if(gifts && gifts.length > 0) engineUsed = "Gemini";
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
                const rawGifts = cleanAndParse(data.choices[0].message.content);
                gifts = filterGifts(rawGifts, query);
                if(gifts && gifts.length > 0) engineUsed = "OpenRouter";
            }
        } catch (error) { console.error("OpenRouter failed"); }
    }

    // --- FINAL RESPONSE ---
    // ഫിൽട്ടർ ചെയ്തതിന് ശേഷം 8 എണ്ണം ഉണ്ടെങ്കിൽ അത് തരും, ഇല്ലെങ്കിൽ Fallback
    if (gifts && Array.isArray(gifts) && gifts.length > 0) {
        return res.status(200).json({ success: true, gifts: gifts.slice(0, 8), source: engineUsed });
    } else {
        const fallbackGifts = [
            `${query.split(',')[0].trim()}`, 
            `${query.split(',')[0].trim()} Toy`, 
            `${query.split(',')[0].trim()} Gift`, 
            `${query.split(',')[0].trim()} Set`,
            `${query.split(',')[0].trim()} Pack`,
            `${query.split(',')[0].trim()} Combo`,
            `Toy ${query.split(',')[0].trim()}`,
            `Best ${query.split(',')[0].trim()}`
        ];
        return res.status(200).json({ 
            success: true, 
            gifts: fallbackGifts, 
            source: "Fallback System" 
        });
    }
}