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

        // ── Identify the user ────────────────────────────────────────────────
        const phone    = (data.phone || data.wa_id || data.whatsapp_bot_username || '').toString().trim();
        const name     = (data.first_name || data.name || data.contact_name || '').toString().trim();
        const chatId   = (data.chat_id || '').toString().trim();
        const sessionId = chatId || phone || ('anon-' + Date.now());

        const answersToSave = {};
        if (phone) answersToSave['WhatsApp Number'] = phone;

        // ── Q&A from user_input_data ───────────────────────────────────────────
        if (Array.isArray(data.user_input_data)) {
            data.user_input_data.forEach(item => {
                if (item.question && item.answer !== undefined) {
                    const cleanQ = String(item.question).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                    answersToSave[cleanQ] = String(item.answer);
                }
            });
        }

        const userMessage = (data.user_message || '').toString().trim();
        const isTriggerKeyword = /^(hi|hello|start|hey|hii|helo|नमस्ते)$/i.test(userMessage);
        
        const rawPostbackId = (data.postbackid || data.postBackId || '').toString().trim();
        const questionOrder = getQuestionOrder(bot.postbacks);

        // Fetch session
        let sessionDoc = await ChatData.findOne({ sessionId, apiKey });
        if (!sessionDoc) {
            sessionDoc = new ChatData({ sessionId, apiKey, owner: bot.owner, phone, name });
        }
        
        const currentStep = sessionDoc.currentStep || 0;
        let nextStep = currentStep;

        // ── BUTTON CLICK - Retroactive Resolution ────────────────────────────
        // Because BizzRiser sends only a short postbackid, we don't know the button text.
        // We track the flow via sequence:
        // 1. When button is clicked at Step N, we save the answer as "[Postback: ID]"
        //    under Question N.
        // 2. We keep this pending. Next time user interacts, we are at Step N+1.
        // 3. We check bot.postbacks for Question N: which button's `nextQuestion` matches Step N+1?
        //    That MUST be the button they pressed!
        // ─────────────────────────────────────────────────────────────────────

        if (rawPostbackId) {
            // First check if we've learned this ID already across sessions
            const learned = (bot.learnedPostbacks || []).find(lp => lp.runtimePostbackId === rawPostbackId);
            
            if (learned) {
                // Known button!
                answersToSave[learned.sourceNodeName] = learned.buttonText;
                console.log(`✅ Learned: "${rawPostbackId}" → [${learned.sourceNodeName}] "${learned.buttonText}"`);
                
                // Update session state
                sessionDoc.lastQuestion = learned.sourceNodeName;
                sessionDoc.pendingRuntimePostbackId = ''; // resolved!
                
                // Advance step by finding where this fits in the flow
                const qIdx = questionOrder.indexOf(learned.sourceNodeName);
                if (qIdx !== -1) nextStep = qIdx + 1;
                
            } else if (questionOrder.length > 0 && currentStep < questionOrder.length) {
                // Unknown button ID: Process sequentially
                const questionName = questionOrder[currentStep];
                
                // If there's a PENDING postback from the PREVIOUS step, we can resolve it now!
                // Because we've now arrived at `questionName`, we can see which button from
                // `sessionDoc.lastQuestion` leads to `questionName`.
                if (sessionDoc.pendingRuntimePostbackId && sessionDoc.lastQuestion) {
                    const prevQ = sessionDoc.lastQuestion;
                    const prevPostbackId = sessionDoc.pendingRuntimePostbackId;
                    
                    // Find button under prevQ whose nextQuestion matches current questionName
                    const candidates = (bot.postbacks || []).filter(p => p.sourceNodeName === prevQ);
                    const matchedBtn = candidates.find(p => {
                        if (!p.nextQuestion) return false;
                        const nq = p.nextQuestion.trim().toLowerCase();
                        const qn = questionName.trim().toLowerCase();
                        return nq.startsWith(qn) || qn.startsWith(nq) || nq === qn;
                    });
                    
                    if (matchedBtn) {
                        answersToSave[prevQ] = matchedBtn.buttonText;
                        console.log(`🔄 Retroactively resolved prev button: "${prevPostbackId}" = "${matchedBtn.buttonText}"`);
                        
                        // Save to learnedPostbacks globally for future
                        await Bot.updateOne(
                            { apiKey },
                            { $push: { learnedPostbacks: {
                                runtimePostbackId: prevPostbackId,
                                buttonText: matchedBtn.buttonText,
                                sourceNodeName: prevQ
                            }}}
                        );
                    }
                }
                
                // Store placeholder for the CURRENT button press
                answersToSave[questionName] = `[Postback: ${rawPostbackId}]`;
                console.log(`📌 Step ${currentStep}: postback "${rawPostbackId}" → question "${questionName}"`);
                
                // Update session state for the next webhook to resolve
                sessionDoc.lastQuestion = questionName;
                sessionDoc.pendingRuntimePostbackId = rawPostbackId;
                nextStep = currentStep + 1;
                
                // In case this is the LAST question and won't be resolved by a future step, save placeholder
                await Bot.updateOne(
                    { apiKey },
                    { $push: { learnedPostbacks: {
                        runtimePostbackId: rawPostbackId,
                        buttonText: `[Postback: ${rawPostbackId}]`,
                        sourceNodeName: questionName
                    }}}
                );
            }
        } else if (userMessage) {
            if (!isTriggerKeyword) {
                // Plain text message
                if (questionOrder.length > 0 && currentStep < questionOrder.length) {
                    const questionName = questionOrder[currentStep];
                    answersToSave[questionName] = userMessage;
                    sessionDoc.lastQuestion = questionName;
                    nextStep = currentStep + 1;
                } else {
                    answersToSave['User Message'] = userMessage;
                }
            } else {
                // Trigger keyword resets the flow
                nextStep = 0;
                sessionDoc.lastQuestion = '';
                sessionDoc.pendingRuntimePostbackId = '';
            }
        }

        // ── Persist to DB ─────────────────────────────────────────────────────
        sessionDoc.currentStep = nextStep;
        if (name) sessionDoc.name = name;
        if (phone) sessionDoc.phone = phone;

        // Apply answers
        const currentAnswers = sessionDoc.answers || {};
        Object.keys(answersToSave).forEach(k => {
            const safeKey = k.replace(/\./g, '_DOT_');
            currentAnswers[safeKey] = answersToSave[k];
        });
        sessionDoc.answers = currentAnswers;
        
        sessionDoc.webhookHistory.push({ payload: data, receivedAt: new Date() });

        // Save session
        await sessionDoc.save();

        // One final cleanup: If we retroactively resolved the answer up above, the ChatData might
        // still have the old "[Postback: xxx]" in answers in MongoDB because of Mongoose mix-types.
        // We ensure a direct update query for safe overwriting.
        const setQuery = {};
        Object.keys(answersToSave).forEach(k => {
            const safeKey = k.replace(/\./g, '_DOT_');
            setQuery[`answers.${safeKey}`] = answersToSave[k];
        });
        await ChatData.updateOne({ _id: sessionDoc._id }, { $set: setQuery });

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
