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
        
        const bot = await Bot.findOne({ apiKey });
        if (!bot) return res.status(404).json({ error: "Bot not found" });

        const phone    = (data.phone || data.wa_id || data.chat_id || data.whatsapp_bot_username || '').toString().trim();
        const name     = (data.first_name || data.name || data.contact_name || '').toString().trim();
        const sessionId = (data.chat_id || phone || ('anon-' + Date.now())).toString().trim();

        const answersToSave = {};
        if (phone) answersToSave['WhatsApp Number'] = phone;

        if (Array.isArray(data.user_input_data)) {
            data.user_input_data.forEach(item => {
                if (item.question && item.answer !== undefined) {
                    const cleanQ = String(item.question).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                    answersToSave[cleanQ] = String(item.answer);
                }
            });
        }

        const rawPostbackId = (data.postbackid || data.postBackId || '').toString().trim();
        const userMessage = (data.user_message || '').toString().trim();
        const isTriggerKeyword = /^(hi|hello|start|hey|hii|helo|नमस्ते)$/i.test(userMessage);

        let sessionDoc = await ChatData.findOne({ sessionId, apiKey });
        if (!sessionDoc) {
            sessionDoc = new ChatData({ sessionId, apiKey, owner: bot.owner, phone, name });
        }

        if (isTriggerKeyword) {
            sessionDoc.lastQuestion = '';
            sessionDoc.pendingRuntimePostbackId = '';
            sessionDoc.currentStep = 0;
            console.log(`✨ Trigger keyword detected for ${sessionId}`);
        }

        const allPostbacks = bot.postbacks || [];
        const questionOrder = getQuestionOrder(allPostbacks);
        const rootQuestion = questionOrder[0] || '';
        let currentQuestion = sessionDoc.lastQuestion || rootQuestion;
        if (rawPostbackId) {
            // A. Retroactively resolve PREVIOUS button if pending
            if (sessionDoc.pendingRuntimePostbackId && sessionDoc.lastQuestion) {
                const prevQ = sessionDoc.lastQuestion;
                const prevId = sessionDoc.pendingRuntimePostbackId;
                const branches = allPostbacks.filter(p => p.sourceNodeName === prevQ);
                
                let matchedBtn;
                // 1. Resolve using common global memory
                const learnedCurrent = (bot.learnedPostbacks || []).find(lp => lp.runtimePostbackId === rawPostbackId);
                // 2. Resolve using CURRENT button text if BizzRiser sent it
                if (learnedCurrent) {
                    const targetQ = learnedCurrent.sourceNodeName;
                    matchedBtn = branches.find(p => p.nextQuestion && (
                        p.nextQuestion.trim().toLowerCase() === targetQ.trim().toLowerCase() ||
                        targetQ.trim().toLowerCase().startsWith(p.nextQuestion.trim().toLowerCase())
                    ));
                }
                
                // Fallback to first branch if still unknown
                if (!matchedBtn) matchedBtn = branches.find(p => p.nextQuestion);

                if (matchedBtn) {
                    answersToSave[prevQ] = matchedBtn.buttonText;
                    console.log(`🔄 Resolved prev "${prevId}" → "${matchedBtn.buttonText}"`);
                    if (!(bot.learnedPostbacks || []).some(lp => lp.runtimePostbackId === prevId)) {
                        await Bot.updateOne({ apiKey }, { $push: { learnedPostbacks: {
                            runtimePostbackId: prevId,
                            buttonText: matchedBtn.buttonText,
                            sourceNodeName: prevQ
                        }}});
                    }
                    currentQuestion = matchedBtn.nextQuestion;
                }
            }

            // B. Process CURRENT button
            let learned = (bot.learnedPostbacks || []).find(lp => lp.runtimePostbackId === rawPostbackId);
            
            // NEW: If not learned globally, but we HAVE the button text in userMessage, use it!
            if (!learned && userMessage && currentQuestion) {
                const candidates = allPostbacks.filter(p => p.sourceNodeName === currentQuestion);
                const matchByText = candidates.find(p => 
                    p.buttonText.trim().toLowerCase() === userMessage.trim().toLowerCase() ||
                    userMessage.trim().toLowerCase().includes(p.buttonText.trim().toLowerCase())
                );
                
                if (matchByText) {
                    learned = {
                        runtimePostbackId: rawPostbackId,
                        buttonText: matchByText.buttonText,
                        sourceNodeName: currentQuestion
                    };
                    // Save this new learning globally immediately!
                    await Bot.updateOne({ apiKey }, { $push: { learnedPostbacks: learned } });
                    console.log(`💡 Learned NEW ID via userMessage: "${rawPostbackId}" → "${matchByText.buttonText}"`);
                }
            }

            if (learned) {
                answersToSave[learned.sourceNodeName] = learned.buttonText;
                const botButton = allPostbacks.find(p => p.sourceNodeName === learned.sourceNodeName && p.buttonText === learned.buttonText);
                sessionDoc.lastQuestion = (botButton && botButton.nextQuestion) ? botButton.nextQuestion : learned.sourceNodeName;
                sessionDoc.pendingRuntimePostbackId = ''; 
            } else {
                if (currentQuestion) {
                    answersToSave[currentQuestion] = `[Postback: ${rawPostbackId}]`;
                    sessionDoc.lastQuestion = currentQuestion;
                    sessionDoc.pendingRuntimePostbackId = rawPostbackId;
                }
            }
        } else if (userMessage && !isTriggerKeyword) {
            if (currentQuestion) {
                answersToSave[currentQuestion] = userMessage;
                const branches = allPostbacks.filter(p => p.sourceNodeName === currentQuestion);
                if (branches[0] && branches[0].nextQuestion) sessionDoc.lastQuestion = branches[0].nextQuestion;
            } else {
                answersToSave['User Message'] = userMessage;
            }
        }

        // C. Final Persistence
        const finalIdx = getQuestionOrder(allPostbacks).indexOf(sessionDoc.lastQuestion);
        sessionDoc.currentStep = finalIdx !== -1 ? finalIdx + 1 : 0;
        if (name) sessionDoc.name = name;
        if (phone) sessionDoc.phone = phone;

        const currentAnswers = sessionDoc.answers || {};
        Object.keys(answersToSave).forEach(k => {
            currentAnswers[k.replace(/\./g, '_DOT_')] = answersToSave[k];
        });
        sessionDoc.answers = currentAnswers;
        sessionDoc.webhookHistory.push({ payload: data, receivedAt: new Date() });

        await sessionDoc.save();
        const setQuery = {};
        Object.keys(answersToSave).forEach(k => {
            setQuery[`answers.${k.replace(/\./g, '_DOT_')}`] = answersToSave[k];
        });
        await ChatData.updateOne({ _id: sessionDoc._id }, { $set: setQuery });

        console.log(`💾 Saved session ${sessionId}`);
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
        questionOrder.forEach(q => {
            if (!allFields.includes(q)) allFields.push(q);
        });
        
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
