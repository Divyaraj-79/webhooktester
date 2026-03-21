const ChatData = require('../models/ChatData');
const Bot = require('../models/Bot');

// Keys to always skip from being shown as columns
const SKIP_KEYS = new Set([
    'postbackid', 'postbackId', 'user_input_data', 'chat_id', 'whatsapp_bot_username',
    'id', 'updatedAt', 'createdAt', 'apiKey', 'sessionId', 'conversationId', '_id', '__v',
    'totalMessages', 'messages', 'bot_id', 'platform', 'customer_id', 'triggerKeyword',
    'start_bot_flow', 'rawwebhookpayload', 'webhookhistory'
]);

function isTechnicalKey(key) {
    const k = key.toLowerCase().replace(/_dot_/g, '.');
    if (SKIP_KEYS.has(k)) return true;
    if (k.match(/^[0-9a-f]{24}$/i)) return true;
    if (k.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) return true;
    if (k.startsWith('_')) return true;
    return false;
}

exports.receiveWebhook = async (req, res) => {
    try {
        const apiKey = req.params.apiKey;
        const data = req.body;
        console.log(`📥 Webhook received. API Key: ${apiKey}`);
        console.log("📦 RAW:", JSON.stringify(data));

        const bot = await Bot.findOne({ apiKey });
        if (!bot) return res.status(404).json({ error: "Bot not found" });

        // ── Identify the user ────────────────────────────────────────────────
        const phone = (data.phone || data.wa_id || data.whatsapp_bot_username || '').toString().trim();
        const name  = (data.name || data.first_name || data.contact_name || '').toString().trim();
        const sessionId = phone || ('anon-' + Date.now());

        // ── Build answers to save ────────────────────────────────────────────
        const answersToSave = {};

        // Always store the WhatsApp number as a visible column
        if (phone) answersToSave['WhatsApp Number'] = phone;

        // ── KEY INSIGHT: user_message = what the user typed or clicked ────────
        //
        // BizzRiser sends one webhook per user interaction.
        // For EVERY interaction (text reply or button click), the field
        // `user_message` contains what the user sent.
        //
        // Simultaneously, `user_input_data` may or may not carry structured Q&A.
        // For BUTTON clicks, user_input_data is always [] (empty).
        //
        // Strategy:
        //   1. First, capture any structured Q&A from user_input_data.
        //   2. Then, look at user_message. Look it up in the bot.postbacks table
        //      to find out WHICH QUESTION it answers (sourceNodeName).
        //      Store it under that question name as the answer.
        // ────────────────────────────────────────────────────────────────────

        // Step 1: Structured Q&A pairs from user_input_data
        if (Array.isArray(data.user_input_data)) {
            data.user_input_data.forEach(item => {
                if (item.question && item.answer !== undefined && item.answer !== null) {
                    const cleanQ = String(item.question).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                    answersToSave[cleanQ] = String(item.answer);
                }
            });
        }

        // Step 2: Map user_message to the right question column using bot.postbacks
        const userMessage = (data.user_message || '').toString().trim();
        if (userMessage) {
            // Try to find this message in our postbacks map
            const matchedPostback = (bot.postbacks || []).find(p => {
                const btnText = (p.buttonText || '').trim();
                return btnText === userMessage || btnText.toLowerCase() === userMessage.toLowerCase();
            });

            if (matchedPostback) {
                // Found! Use the question (sourceNodeName) as the column
                const colName = matchedPostback.sourceNodeName || 'Button Response';
                answersToSave[colName] = matchedPostback.buttonText;
                console.log(`✅ Matched user_message "${userMessage}" → column: "${colName}"`);
            } else {
                // Not a button — store as generic user message
                // Use the start_bot_flow title as context if available
                const msgKey = data.start_bot_flow || 'User Message';
                answersToSave[msgKey] = userMessage;
                console.log(`📝 Unmatched user_message: "${userMessage}" → stored as "${msgKey}"`);
            }
        }

        // Step 3: Capture postbackid for reference (shown in table as info)
        const rawPostbackId = (data.postbackid || data.postBackId || '').trim();
        if (rawPostbackId) {
            // Also try to look up postback id in learnedPostbacks or bot.postbacks
            const pbMatch = (bot.postbacks || []).find(p => 
                p.postbackId === rawPostbackId || p.postbackId === rawPostbackId
            );
            if (pbMatch && !answersToSave[pbMatch.sourceNodeName]) {
                answersToSave[pbMatch.sourceNodeName] = pbMatch.buttonText;
                console.log(`🎯 Matched postbackId "${rawPostbackId}" → "${pbMatch.buttonText}"`);
            }
        }

        // ── Persist to DB ─────────────────────────────────────────────────────
        const setQuery = {
            sessionId,
            apiKey,
            owner: bot.owner,
        };
        if (name)  setQuery.name  = name;
        if (phone) setQuery.phone = phone;

        Object.keys(answersToSave).forEach(key => {
            const safeKey = key.replace(/\./g, '_DOT_');
            setQuery[`answers.${safeKey}`] = answersToSave[key];
        });

        await ChatData.findOneAndUpdate(
            { sessionId, apiKey },
            {
                $set: setQuery,
                $push: { webhookHistory: { payload: data, receivedAt: new Date() } }
            },
            { upsert: true }
        );

        console.log(`💾 Saved session ${sessionId} with answers:`, Object.keys(answersToSave));
        res.sendStatus(200);

    } catch (err) {
        console.error("❌ Webhook error:", err);
        res.status(500).json({ error: "Webhook failed" });
    }
};

// ── Get entries for dashboard ─────────────────────────────────────────────────
exports.getEntriesByApiKey = async (req, res) => {
    try {
        const { apiKey } = req.params;
        const userId = req.user.id;

        const bot = await Bot.findOne({ apiKey, owner: userId });
        if (!bot) return res.status(404).json({ error: "Bot not found or unauthorized" });

        const entries = await ChatData.find({ apiKey, owner: userId }).sort({ updatedAt: -1 });

        // Collect all unique column names from all entries
        const dynamicKeys = new Set();
        entries.forEach(entry => {
            Object.keys(entry.answers || {}).forEach(k => {
                const cleanK = k.replace(/_DOT_/g, '.');
                if (!isTechnicalKey(cleanK) && cleanK.length < 120) {
                    dynamicKeys.add(cleanK);
                }
            });
        });

        // Build field list: WhatsApp Number first, then bot-defined fields, then dynamic ones
        const priorityFields = ['WhatsApp Number'];
        const botFieldNames = new Set((bot.postbacks || []).map(p => p.sourceNodeName).filter(Boolean));
        
        const allFields = [];
        // Priority fields first
        priorityFields.forEach(f => { if (dynamicKeys.has(f)) allFields.push(f); });
        // Bot-defined question columns next
        botFieldNames.forEach(f => { if (dynamicKeys.has(f) && !allFields.includes(f)) allFields.push(f); });
        // Remaining dynamic keys
        dynamicKeys.forEach(k => { if (!allFields.includes(k)) allFields.push(k); });

        const formatted = entries.map(entry => {
            const answers = entry.answers || {};
            const row = {
                id: entry._id,
                name: entry.name || 'N/A',
                phone: entry.phone || 'N/A',
                updatedAt: entry.updatedAt
            };

            allFields.forEach(field => {
                const safeKey = field.replace(/\./g, '_DOT_');
                const val = answers[safeKey] || answers[field];
                row[field] = val ? String(val) : 'N/A';
            });

            return row;
        });

        res.json({
            botName: bot.name || 'Chatbot',
            fields: allFields,
            entries: formatted
        });

    } catch (err) {
        console.error("❌ getEntriesByApiKey error:", err);
        res.status(500).json({ error: "Failed to fetch entries" });
    }
};

// ── Structured Fetch (legacy) ─────────────────────────────────────────────────
exports.getStructured = async (req, res) => {
    try {
        const apiKey = req.params.apiKey;
        const bot = await Bot.findOne({ apiKey, owner: req.user.id });
        if (!bot) return res.status(404).json({ error: "Bot not found or unauthorized" });

        const chats = await ChatData.find({ apiKey, owner: req.user.id });
        const rows = chats.map(chat => ({
            phone: chat.phone || 'N/A',
            name: chat.name || 'N/A',
            ...Object.fromEntries(
                Object.entries(chat.answers || {}).map(([k, v]) => [k.replace(/_DOT_/g, '.'), v])
            )
        }));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed" });
    }
};
