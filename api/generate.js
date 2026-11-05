export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const keys = {
        gemini: !!process.env.GEMINI_API_KEY,
        grok: !!process.env.GROK_API_KEY,
        openrouter: !!process.env.OPENROUTER_API_KEY,
        huggingface: !!process.env.HUGGINGFACE_API_KEY
    };

    const prompt = `You are a luxury gift concierge. Return exactly 8 gift ideas as valid JSON array of strings. No markdown. Format: ["Item 1", "Item 2"]`;

    function cleanAndParse(text) {
        try {
            let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const s = clean.indexOf('['); const e = clean.lastIndexOf(']');
            if (s !== -1 && e !== -1) { clean = clean.substring(s, e + 1); return JSON.parse(clean); }
        } catch (e) { console.error("Parse error:", e.message); }
        return null;
    }

    let gifts = null; let engineUsed = "None"; let errorLog = [];

    // ENGINE 1: GEMINI 1.5 FLASH (Fixed!)
    if (!gifts && keys.gemini) {
        try {
            console.log("Trying Gemini...");
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: `${prompt}\n\nUser: ${query}` }] }] })
            });
            const d = await r.json();
            if (d.candidates?.[0]?.content?.parts[0]?.text) {
                gifts = cleanAndParse(d.candidates[0].content.parts[0].text);
                if(gifts) engineUsed = "Gemini";
            } else { errorLog.push("Gemini: " + JSON.stringify(d).slice(0,200)); console.error("Gemini Error:", d); }
        } catch (e) { errorLog.push("Gemini fetch failed: " + e.message); console.error("Gemini failed:", e.message); }
    }

    // ENGINE 2: OPENROUTER FREE GROK (Fixed! - Free Model!)
    if (!gifts && keys.openrouter) {
        try {
            console.log("Trying OpenRouter...");
            const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "x-ai/grok-4-fast:free", // FREE GROK!
                    messages: [{ role: "system", content: prompt }, { role: "user", content: query }]
                })
            });
            const d = await r.json();
            if (d.choices?.[0]) { gifts = cleanAndParse(d.choices[0].message.content); if(gifts) engineUsed = "OpenRouter"; }
            else { errorLog.push("OpenRouter: " + JSON.stringify(d).slice(0,200)); console.error("OpenRouter Error:", d); }
        } catch (e) { errorLog.push("OpenRouter failed: " + e.message); console.error("OpenRouter failed:", e.message); }
    }

    // ENGINE 3: GROK DIRECT (Fixed!)
    if (!gifts && keys.grok) {
        try {
            console.log("Trying Grok...");
            const r = await fetch("https://api.x.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${process.env.GROK_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "grok-2-latest", messages: [{ role: "system", content: prompt }, { role: "user", content: query }] })
            });
            const d = await r.json();
            if (d.choices?.[0]) { gifts = cleanAndParse(d.choices[0].message.content); if(gifts) engineUsed = "Grok"; }
            else { errorLog.push("Grok: " + JSON.stringify(d).slice(0,200)); console.error("Grok Error:", d); }
        } catch (e) { errorLog.push("Grok failed: " + e.message); console.error("Grok failed:", e.message); }
    }

    // ENGINE 4: HUGGING FACE (Fixed! - Free Model!)
    if (!gifts && keys.huggingface) {
        try {
            console.log("Trying Hugging Face...");
            const r = await fetch("https://api-inference.huggingface.co/models/google/gemma-2-2b-it", {
                method: "POST",
                headers: { "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ inputs: `${prompt}\n\nUser: ${query}`, parameters: { max_new_tokens: 200 } })
            });
            const d = await r.json();
            if (d[0]?.generated_text) { gifts = cleanAndParse(d[0].generated_text); if(gifts) engineUsed = "HuggingFace"; }
            else { errorLog.push("HF: " + JSON.stringify(d).slice(0,200)); console.error("HF Error:", d); }
        } catch (e) { errorLog.push("HF failed: " + e.message); console.error("HF failed:", e.message); }
    }

    if (gifts?.length > 0) return res.status(200).json({ success: true, gifts: gifts.slice(0, 8), source: engineUsed });
    else return res.status(200).json({ success: false, error: 'All Engines failed', details: errorLog, gifts: [] });
}