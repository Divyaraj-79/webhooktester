const ChatData = require('../models/ChatData');
const Bot = require('../models/Bot');

const SKIP_KEYS = new Set([
    'postbackid', 'postbackId', 'user_input_data', 'chat_id', 'whatsapp_bot_username',
    'id', 'updatedAt', 'createdAt', 'apiKey', 'sessionId', 'conversationId', '_id', '__v',
    'totalMessages', 'messages', 'bot_id', 'platform', 'customer_id', 'triggerKeyword',
    'start_bot_flow', 'rawwebhookpayload', 'webhookhistory', 'rawWebhookPayload'
]);

function isTechnicalKey(key) {
    const k = key.toLowerCase().replace(/_dot_/g, '.');
    for (const sk of SKIP_KEYS) {
        if (k === sk.toLowerCase()) return true;
    }
    if (k.match(/^[0-9a-f]{24}$/i)) return true;
    if (k.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) return true;
    if (k.startsWith('_')) return true;
    return false;
}

// Get ordered list of unique question columns from bot.postbacks
function getQuestionOrder(botPostbacks) {
    const questionOrder = [];
    const seen = new Set();
    (botPostbacks || []).forEach(p => {
        if (p.sourceNodeName && !seen.has(p.sourceNodeName)) {
            seen.add(p.sourceNodeName);
            questionOrder.push(p.sourceNodeName);
        }
    });
    return questionOrder;
}

exports.receiveWebhook = async (req, res) => {
    try {
        const apiKey = req.params.apiKey;
        const data = req.body;
        console.log(`📥 Webhook for API Key: ${apiKey}`);
        console.log("📦 RAW:", JSON.stringify(data));

        const bot = await Bot.findOne({ apiKey });
        if (!bot) return res.status(404).json({ error: "Bot not found" });

        // ── Identify the user ────────────────────────────────────────────────
        const phone    = (data.phone || data.wa_id || data.whatsapp_bot_username || '').toString().trim();
        const name     = (data.first_name || data.name || data.contact_name || '').toString().trim();
        const chatId   = (data.chat_id || '').toString().trim();
        const sessionId = chatId || phone || ('anon-' + Date.now());

        const answersToSave = {};

        // Always store phone as WhatsApp Number column
        if (phone) answersToSave['WhatsApp Number'] = phone;

        // ── Q&A from user_input_data ───────────────────────────────────────────
        if (Array.isArray(data.user_input_data)) {
            data.user_input_data.forEach(item => {
                if (item.question && item.answer !== undefined && item.answer !== null) {
                    const cleanQ = String(item.question).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                    answersToSave[cleanQ] = String(item.answer);
                }
            });
        }

        // ── Text messages from user ────────────────────────────────────────────
        const userMessage = (data.user_message || '').toString().trim();
        // Store text messages only if they're not trigger keywords
        const isTriggerKeyword = /^(hi|hello|start|hey|hii|helo|नमस्ते)$/i.test(userMessage);

        // ── BUTTON CLICK DETECTION ────────────────────────────────────────────
        //
        // BizzRiser button clicks send:
        //   - postbackid: a short runtime ID (e.g. "sdiugGyR7gLaX8V")
        //   - NO user_message (or empty user_message)
        //
        // We cannot know button text from the payload alone.
        // We use sequence position to know WHICH QUESTION it answers.
        //
        // For each session, currentStep tracks how many button questions are answered.
        // Each time a button postback comes in, we:
        //   1. Check if this runtime postbackid is already in learnedPostbacks → use stored text
        //   2. Otherwise, look up questionOrder[currentStep] → that's the answering question
        //   3. Store the answer as "PostbackID: <id>" since we don't know which button was pressed
        //   4. Increment currentStep for this session
        // ─────────────────────────────────────────────────────────────────────
        
        const rawPostbackId = (data.postbackid || data.postBackId || '').toString().trim();
        const questionOrder = getQuestionOrder(bot.postbacks);

        if (rawPostbackId) {
            // Step 1: Check learnedPostbacks (exact postbackid → button mapping)
            const learned = (bot.learnedPostbacks || []).find(lp => lp.runtimePostbackId === rawPostbackId);
            
            if (learned) {
                // Known! Use stored answer
                answersToSave[learned.sourceNodeName] = learned.buttonText;
                console.log(`✅ Learned: "${rawPostbackId}" → [${learned.sourceNodeName}] "${learned.buttonText}"`);
            } else if (questionOrder.length > 0) {
                // Step 2: Get session's current step
                const sessionDoc = await ChatData.findOne({ sessionId, apiKey }, { currentStep: 1 });
                const step = sessionDoc?.currentStep || 0;
                
                if (step < questionOrder.length) {
                    const questionName = questionOrder[step];
                    // We know the question but not which specific button — store postbackid as placeholder
                    // This will be replaced if we learn the actual text later
                    answersToSave[questionName] = `[Postback: ${rawPostbackId}]`;
                    console.log(`📌 Step ${step}: postback "${rawPostbackId}" → question "${questionName}"`);
                    
                    // Save to learnedPostbacks so we can associate if button text comes later
                    await Bot.updateOne(
                        { apiKey },
                        { $push: { learnedPostbacks: {
                            runtimePostbackId: rawPostbackId,
                            buttonText: `[Postback: ${rawPostbackId}]`,
                            sourceNodeName: questionName
                        }}}
                    );
                    
                    // Increment step for this session
                    await ChatData.findOneAndUpdate(
                        { sessionId, apiKey },
                        { $inc: { currentStep: 1 } },
                        { upsert: true }
                    );
                } else {
                    console.log(`⚠️ Button press beyond question flow at step ${step}`);
                }
            } else {
                console.log(`⚠️ Bot has 0 postbacks — re-upload the bot JSON first!`);
            }
        } else if (userMessage && !isTriggerKeyword) {
            // Plain text answer (not a button)
            // Try to map to current question in flow
            if (questionOrder.length > 0) {
                const sessionDoc = await ChatData.findOne({ sessionId, apiKey }, { currentStep: 1 });
                const step = sessionDoc?.currentStep || 0;
                
                if (step < questionOrder.length) {
                    const questionName = questionOrder[step];
                    answersToSave[questionName] = userMessage;
                    console.log(`📝 Text: "${userMessage}" → question "${questionName}"`);
                    await ChatData.findOneAndUpdate(
                        { sessionId, apiKey },
                        { $inc: { currentStep: 1 } },
                        { upsert: true }
                    );
                } else {
                    answersToSave['User Message'] = userMessage;
                }
            } else {
                answersToSave['User Message'] = userMessage;
            }
        }

        // ── Persist to DB ─────────────────────────────────────────────────────
        const setQuery = { sessionId, apiKey, owner: bot.owner };
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

        console.log(`💾 Saved session ${sessionId}. Answer keys: ${JSON.stringify(Object.keys(answersToSave))}`);
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

        // Collect all unique column names
        const dynamicKeys = new Set();
        entries.forEach(entry => {
            Object.keys(entry.answers || {}).forEach(k => {
                const cleanK = k.replace(/_DOT_/g, '.');
                if (!isTechnicalKey(cleanK) && cleanK.length < 120) {
                    dynamicKeys.add(cleanK);
                }
            });
        });

        // Ordered fields: WhatsApp Number → question order → rest
        const allFields = [];
        if (dynamicKeys.has('WhatsApp Number')) allFields.push('WhatsApp Number');
        const questionOrder = getQuestionOrder(bot.postbacks);
        questionOrder.forEach(q => { if (dynamicKeys.has(q) && !allFields.includes(q)) allFields.push(q); });
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
            entries: formatted,
            postbackCount: (bot.postbacks || []).length
        });

    } catch (err) {
        console.error("❌ getEntriesByApiKey error:", err);
        res.status(500).json({ error: "Failed to fetch entries" });
    }
};

// ── Structured Fetch ───────────────────────────────────────────────────────────
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
