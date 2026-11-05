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

    const prompt = `You are a world-class luxury gift concierge. The user will describe a person. Return exactly 8 highly specific, premium, and unique gift ideas as a valid JSON array of strings. Do not include markdown, code blocks, or any text other than the JSON array. Example format: ["Item 1", "Item 2", "Item 3"]`;

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
    let errorLog = [];

    // --- ENGINE 1: GEMINI (Using Gemini 1.5 Flash - correct model name) ---
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
            } else {
                errorLog.push("Gemini: " + JSON.stringify(data));
                console.error("Gemini Error:", JSON.stringify(data));
            }
        } catch (error) { 
            errorLog.push("Gemini fetch failed: " + error.message);
            console.error("Gemini failed:", error.message); 
        }
    }

    // --- ENGINE 2: OPENROUTER (Llama 3.1 - more stable) ---
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
                    model: "meta-llama/llama-3.1-8b-instruct", // Updated model
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
            } else {
                errorLog.push("OpenRouter: " + JSON.stringify(data));
                console.error("OpenRouter Error:", JSON.stringify(data));
            }
        } catch (error) { 
            errorLog.push("OpenRouter fetch failed: " + error.message);
            console.error("OpenRouter failed:", error.message); 
        }
    }

    // --- ENGINE 3: HUGGING FACE (Mistral - updated endpoint) ---
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
            } else {
                errorLog.push("HuggingFace: " + JSON.stringify(hfData));
                console.error("HuggingFace Error:", JSON.stringify(hfData));
            }
        } catch (error) { 
            errorLog.push("HuggingFace fetch failed: " + error.message);
            console.error("HuggingFace failed:", error.message); 
        }
    }

    // --- FINAL RESPONSE ---
    if (gifts && Array.isArray(gifts) && gifts.length > 0) {
        return res.status(200).json({ success: true, gifts: gifts.slice(0, 8), source: engineUsed });
    } else {
        return res.status(200).json({ 
            success: false, 
            error: 'All AI Engines failed.', 
            details: errorLog, 
            gifts: [] 
        });
    }
}