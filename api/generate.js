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

    const prompt = `You are a strict search assistant.
The user will provide a search term (e.g., "Snake", "Teddy", "Watch").
Your ONLY task is to return exactly 8 simple variations of that EXACT item.

STRICT RULES:
1. Every single suggestion MUST contain the exact core word the user typed.
2. Do NOT invent new items or add unrelated words (e.g., If user says "Snake", do NOT say "Serpent").
3. Do NOT use words like "Premium", "Luxury", or "Exclusive".
4. Return ONLY a valid JSON array of strings. No markdown, no extra text.

Example for "Watch": ["Watch", "Smart Watch", "Watch Band", "Watch Case", "Watch Strap", "Digital Watch", "Analog Watch", "Kids Watch"]`;

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

    function advancedFilter(gifts, userQuery) {
        if (!gifts || !Array.isArray(gifts)) return [];
        
        const baseQuery = userQuery.toLowerCase().split(',')[0].trim(); 
        
        const forbiddenWords = ["premium", "luxury", "exclusive", "deluxe", "expensive"];
        const seen = new Set();
        const filtered = [];

        for (let gift of gifts) {
            const lowerGift = gift.toLowerCase();

            if (forbiddenWords.some(word => lowerGift.includes(word))) continue;

            if (gift.length > 45) continue;

            if (!lowerGift.includes(baseQuery)) continue;

            if (seen.has(lowerGift)) continue;

            const irrelevantWords = ["phone", "headset", "laptop", "tv", "shoe", "dress"];
            if (baseQuery !== "phone" && baseQuery !== "headset") {
                if (irrelevantWords.some(word => lowerGift.includes(word))) continue;
            }

            seen.add(lowerGift);
            filtered.push(gift);
        }

        return filtered;
    }

    let gifts = null;
    let engineUsed = "None";

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
                gifts = advancedFilter(rawGifts, query);
                if(gifts && gifts.length > 0) engineUsed = "Gemini";
            }
        } catch (error) { console.error("Gemini failed"); }
    }

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
                gifts = advancedFilter(rawGifts, query);
                if(gifts && gifts.length > 0) engineUsed = "OpenRouter";
            }
        } catch (error) { console.error("OpenRouter failed"); }
    }

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
                const rawGifts = cleanAndParse(hfData[0].generated_text);
                gifts = advancedFilter(rawGifts, query);
                if(gifts && gifts.length > 0) engineUsed = "HuggingFace";
            }
        } catch (error) { console.error("HuggingFace failed"); }
    }

    if (gifts && Array.isArray(gifts) && gifts.length > 0) {
        const finalGifts = gifts.slice(0, 8);
        if (finalGifts.length < 8) {
            const baseQ = query.split(',')[0].trim();
            const fallbacks = [`${baseQ} Toy`, `${baseQ} Gift`, `${baseQ} Set`, `${baseQ} Combo`];
            for (let f of fallbacks) {
                if (finalGifts.length >= 8) break;
                if (!finalGifts.some(g => g.toLowerCase() === f.toLowerCase())) {
                    finalGifts.push(f);
                }
            }
        }
        return res.status(200).json({ success: true, gifts: finalGifts, source: engineUsed });
    } else {
        const baseQ = query.split(',')[0].trim();
        const fallbackGifts = [
            `${baseQ}`, 
            `${baseQ} Toy`, 
            `${baseQ} Gift`, 
            `${baseQ} Set`,
            `${baseQ} Pack`,
            `${baseQ} Combo`,
            `Toy ${baseQ}`,
            `Best ${baseQ}`
        ];
        return res.status(200).json({ 
            success: true, 
            gifts: fallbackGifts, 
            source: "Fallback System" 
        });
    }
}