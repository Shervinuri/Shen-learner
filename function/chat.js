// functions/chat.js

// این تابع روی سرور نتلیفای اجرا می‌شود و کلیدهای API شما در اینجا امن هستند.

exports.handler = async function(event) {
    // فقط درخواست‌های POST را قبول می‌کنیم
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // دریافت تاریخچه چت از درخواست فرانت‌اند
        const { contents: chatHistory } = JSON.parse(event.body);

        // خواندن کلیدهای API از متغیرهای محیطی نتلیفای
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

        let responseText = '';
        let primaryApiFailed = false;

        // --- تلاش برای استفاده از Gemini API (هسته اصلی) ---
        if (GEMINI_API_KEY) {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
            try {
                const response = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: chatHistory })
                });

                if (!response.ok) {
                    throw new Error(`Gemini API responded with status: ${response.status}`);
                }

                const result = await response.json();
                if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    responseText = result.candidates[0].content.parts[0].text;
                } else {
                    // اگر پاسخ معتبر نبود، به عنوان خطا در نظر می‌گیریم
                    throw new Error('Invalid response structure from Gemini API.');
                }

            } catch (error) {
                console.warn('Primary Gemini API call failed:', error.message);
                primaryApiFailed = true; // علامت‌گذاری برای رفتن به سراغ فال‌بک
            }
        } else {
            primaryApiFailed = true; // اگر کلید جمنای وجود نداشت، مستقیم به فال‌بک برو
        }


        // --- اگر Gemini ناموفق بود، از OpenRouter (هسته پشتیبان) استفاده کن ---
        if (primaryApiFailed) {
            if (!OPENROUTER_API_KEY) {
                throw new Error('All APIs failed and no fallback key is available.');
            }
            console.log('Switching to OpenRouter fallback...');
            const messages = chatHistory.map(item => ({
                role: item.role === 'model' ? 'assistant' : 'user',
                content: item.parts[0].text
            }));

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: "google/gemma-7b-it", messages })
            });

            if (!response.ok) {
                throw new Error(`OpenRouter API responded with status: ${response.status}`);
            }

            const result = await response.json();
            if (result.choices?.[0]?.message?.content) {
                responseText = result.choices[0].message.content;
            } else {
                throw new Error('Invalid response structure from OpenRouter API.');
            }
        }

        // ارسال پاسخ موفقیت‌آمیز به فرانت‌اند
        return {
            statusCode: 200,
            body: JSON.stringify({ reply: responseText })
        };

    } catch (error) {
        console.error('Error in Netlify function:', error);
        // ارسال پیام خطا به فرانت‌اند
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'خطایی در سرور رخ داد. لطفاً دوباره تلاش کنید.' })
        };
    }
};
