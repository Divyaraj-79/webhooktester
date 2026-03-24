const Bot = require('../models/Bot');
const ChatData = require('../models/ChatData');
const GlobalPostback = require('../models/GlobalPostback');
const botMappings = require('../config/botMappings'); // Import manual static mappings

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

// Helper to map a question text to a Custom Field name if available
function getFieldName(bot, rawKey) {
    if (!rawKey) return '';
    const cleanK = String(rawKey).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // 1. Check in postbacks (Buttons)
    const pbMatch = (bot.postbacks || []).find(p => 
        p.sourceNodeName === cleanK || 
        cleanK.startsWith(p.sourceNodeName) || 
        p.sourceNodeName.startsWith(cleanK.substring(0, 40)) // Handle truncation
    );
    if (pbMatch && pbMatch.fieldName) return pbMatch.fieldName;

    // 2. Check in fields (Text Inputs)
    const fieldMatch = (bot.fields || []).find(f => 
        f.questionText === cleanK || 
        cleanK.includes(f.questionText) || 
        f.questionText.includes(cleanK)
    );
    if (fieldMatch && fieldMatch.fieldName) return fieldMatch.fieldName;

    return cleanK;
}

// ── BizzRiser Real-time Data Enrichment ─────────────────────────────────────
async function enrichFromBizzRiser(bot, phone, chatDataId) {
    try {
        console.log(`🔍 [Enrich] Triggered for ${phone} (Bot: ${bot.name})`);
        
        const bizzRes = await fetch('https://dash.bizzriser.com/api/v1/whatsapp/subscriber/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `apiToken=${bot.bizzriserToken}&phone_number_id=${bot.phoneNumberId}&phone_number=${phone}`
        });

        const bizzData = await bizzRes.json();
        if (bizzData.status !== "1" || !bizzData.message || bizzData.message.length === 0) {
            console.log(`⚠️ [Enrich] No data found for ${phone} on BizzRiser`);
            return;
        }

        const subscriber = bizzData.message[0];
        const answersToUpdate = {};

        // Map standard fields
        if (subscriber.first_name) answersToUpdate['Name'] = subscriber.first_name + (subscriber.last_name ? ' ' + subscriber.last_name : '');
        if (subscriber.email) answersToUpdate['Email'] = subscriber.email;

        // BizzRiser often sends custom fields as top-level keys in this response
        // Or in a 'custom_fields' array. Let's handle both.
        const skipKeys = new Set(['subscriber_id', 'chat_id', 'first_name', 'last_name', 'email', 'gender', 'label_names', 'status', 'created_at', 'updated_at']);
        
        Object.keys(subscriber).forEach(key => {
            if (!skipKeys.has(key) && !isTechnicalKey(key)) {
                // Try to map key to a friendly field name if it matches a postback fieldName
                const friendlyKey = getFieldName(bot, key);
                answersToUpdate[friendlyKey] = String(subscriber[key]);
            }
        });

        if (subscriber.custom_fields && Array.isArray(subscriber.custom_fields)) {
            subscriber.custom_fields.forEach(cf => {
                if (cf.name && cf.value) {
                    const friendlyKey = getFieldName(bot, cf.name);
                    answersToUpdate[friendlyKey] = String(cf.value);
                }
            });
        }

        if (Object.keys(answersToUpdate).length > 0) {
            const setQuery = {};
            Object.keys(answersToUpdate).forEach(k => {
                setQuery[`answers.${k.replace(/\./g, '_DOT_')}`] = answersToUpdate[k];
            });
            await ChatData.updateOne({ _id: chatDataId }, { $set: setQuery });
            console.log(`✅ [Enrich] Successfully updated ${Object.keys(answersToUpdate).length} fields for ${phone}`);
        }

    } catch (err) {
        console.error("❌ [Enrich] Error:", err.message);
    }
}

// Get ordered list of unique question columns from bot.postbacks
function getQuestionOrder(botPostbacks) {
    const questionOrder = [];
    const seen = new Set();
    (botPostbacks || []).forEach(p => {
        const key = p.fieldName || p.sourceNodeName;
        if (key && !seen.has(key)) {
            seen.add(key);
            questionOrder.push(key);
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
                    const key = getFieldName(bot, item.question);
                    answersToSave[key] = String(item.answer);
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
            // A. Retroactive Back-fill for Previous Unresolved Step
            if (sessionDoc.pendingRuntimePostbackId && sessionDoc.lastQuestion) {
                const prevQ = sessionDoc.lastQuestion;
                const prevId = sessionDoc.pendingRuntimePostbackId;
                const branches = allPostbacks.filter(p => p.sourceNodeName === prevQ);
                
                // Which branch from PREVIOUS question leads to the current rawPostbackId's source node?
                let resolvedPrev = null;

                // 1. First, find if we know where THIS incoming ID belongs
                let knownTargetForCurrent = null;
                const currentLearned = (bot.learnedPostbacks || []).find(l => l.runtimePostbackId === rawPostbackId);
                const currentStaticText = botMappings[rawPostbackId];
                
                if (currentStaticText) {
                    const btn = allPostbacks.find(p => p.buttonText === currentStaticText);
                    if (btn) knownTargetForCurrent = btn.sourceNodeName;
                } else if (currentLearned) {
                    knownTargetForCurrent = currentLearned.sourceNodeName;
                }

                // 2. If we know where the NEW id belongs, find which branch from PREV question leads there
                if (knownTargetForCurrent) {
                    resolvedPrev = branches.find(p => p.nextQuestion === knownTargetForCurrent);
                }

                // 3. AGGRESSIVE: If we still don't know, but there's ONLY ONE branch that leads to ANY known next step
                // (This is a fallback for very complex flows)

                if (resolvedPrev) {
                    console.log(`🔄 [Retro] Resolved "${prevId}" as "${resolvedPrev.buttonText}" via current ID "${rawPostbackId}"`);
                    const prevQuestionKey = resolvedPrev.fieldName || prevQ;
                    answersToSave[prevQuestionKey] = resolvedPrev.buttonText;
                    currentQuestion = resolvedPrev.nextQuestion; // Sync current state
                    
                    // Learn the prev ID globally
                    if (!bot.learnedPostbacks.find(l => l.runtimePostbackId === prevId)) {
                        bot.learnedPostbacks.push({
                            runtimePostbackId: prevId,
                            buttonText: resolvedPrev.buttonText,
                            sourceNodeName: prevQ
                        });
                        bot.markModified('learnedPostbacks');
                        await bot.save();
                    }
                }
            }

            // B. Resolve Current Webhook
            let matchedBtn = null;

            // 1. CHECK BOT POSTBACKS DIRECTLY (JSON Static IDs)
            matchedBtn = allPostbacks.find(p => p.postbackId === rawPostbackId && (p.sourceNodeName === currentQuestion || !currentQuestion));
            if (matchedBtn) {
                console.log(`✅ Direct ID Match: ${rawPostbackId} -> ${matchedBtn.buttonText}`);
            }

            // 2. CHECK MANUAL STATIC MAPPINGS (Reliable)
            if (!matchedBtn && botMappings[rawPostbackId]) {
                const manualText = botMappings[rawPostbackId];
                matchedBtn = allPostbacks.find(p => p.buttonText.trim() === manualText.trim() && p.sourceNodeName === currentQuestion);
                if (matchedBtn) {
                    console.log(`✅ Static Mapping: ${rawPostbackId} -> ${matchedBtn.buttonText}`);
                }
            }

            // 2. CHECK GLOBALLY LEARNED MAPPINGS (Bot-specific then Global)
            if (!matchedBtn) {
                const learned = bot.learnedPostbacks.find(l => l.runtimePostbackId === rawPostbackId);
                if (learned) {
                    matchedBtn = allPostbacks.find(p => p.buttonText === learned.buttonText);
                }
                
                if (!matchedBtn) {
                    const globalL = await GlobalPostback.findOne({ 
                        botName: bot.name, 
                        owner: bot.owner, 
                        runtimePostbackId: rawPostbackId 
                    });
                    if (globalL) {
                        matchedBtn = allPostbacks.find(p => p.buttonText === globalL.buttonText);
                    }
                }

                if (matchedBtn) {
                    console.log(`✅ Learned Mapping: ${rawPostbackId} -> ${matchedBtn.buttonText}`);
                }
            }

            // 3. CHECK USER_MESSAGE (IF AVAILABLE)
            if (!matchedBtn && userMessage && currentQuestion) {
                const candidates = allPostbacks.filter(p => p.sourceNodeName === currentQuestion);
                const matchByText = candidates.find(p => 
                    p.buttonText.trim().toLowerCase() === userMessage.trim().toLowerCase() ||
                    userMessage.trim().toLowerCase().includes(p.buttonText.trim().toLowerCase())
                );
                if (matchByText) {
                    matchedBtn = matchByText;
                    console.log(`💡 Text Match: ${rawPostbackId} -> ${matchedBtn.buttonText}`);
                }
            }

            // Final Update for Current Step
            if (matchedBtn) {
                const questionKey = getFieldName(bot, currentQuestion);
                answersToSave[questionKey] = matchedBtn.buttonText;
                sessionDoc.lastQuestion = matchedBtn.nextQuestion;
                sessionDoc.pendingRuntimePostbackId = null;

                // Save learning (Local + Global)
                if (!bot.learnedPostbacks.find(l => l.runtimePostbackId === rawPostbackId)) {
                    bot.learnedPostbacks.push({
                        runtimePostbackId: rawPostbackId,
                        buttonText: matchedBtn.buttonText,
                        sourceNodeName: currentQuestion
                    });
                    await bot.save();

                    // Update Global Learning
                    await GlobalPostback.findOneAndUpdate(
                        { botName: bot.name, owner: bot.owner, runtimePostbackId: rawPostbackId },
                        { buttonText: matchedBtn.buttonText, sourceNodeName: currentQuestion },
                        { upsert: true, new: true }
                    );
                }
            } else {
                // DO NOT GUESS. Keep placeholder.
                if (currentQuestion) {
                    const questionKey = getFieldName(bot, currentQuestion);
                    answersToSave[questionKey] = `[Postback: ${rawPostbackId}]`;
                    sessionDoc.lastQuestion = currentQuestion;
                    sessionDoc.pendingRuntimePostbackId = rawPostbackId;
                    console.log(`⏳ Pending: ${rawPostbackId} at ${currentQuestion} (Mapped to ${questionKey})`);
                }
            }
        } else if (userMessage && !isTriggerKeyword) {
            // Standard Text Input
            if (currentQuestion) {
                answersToSave[currentQuestion] = userMessage;
                // Move to next if it's a linear text message question
                const branches = allPostbacks.filter(p => p.sourceNodeName === currentQuestion);
                if (branches[0] && branches[0].nextQuestion) {
                    sessionDoc.lastQuestion = branches[0].nextQuestion;
                }
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
        sessionDoc.markModified('answers');

        await sessionDoc.save();
        const setQuery = {};
        Object.keys(answersToSave).forEach(k => {
            setQuery[`answers.${k.replace(/\./g, '_DOT_')}`] = answersToSave[k];
        });
        await ChatData.updateOne({ _id: sessionDoc._id }, { $set: setQuery });

        console.log(`💾 Saved session ${sessionId}`);
        res.sendStatus(200);

        // EXTRA: Background Enrichment if BizzRiser credentials exist
        if (bot.bizzriserToken && bot.phoneNumberId && phone) {
            setTimeout(() => {
                enrichFromBizzRiser(bot, phone, sessionDoc._id).catch(console.error);
            }, 1000); // 1s delay to allow BizzRiser to finish internal processing
        }

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
        
        // Add fields from bot.fields (text inputs) if not already in questionOrder
        (bot.fields || []).forEach(f => {
            if (f.fieldName && !questionOrder.includes(f.fieldName)) {
                questionOrder.push(f.fieldName);
            }
        });

        questionOrder.forEach(q => {
            if (!allFields.includes(q)) allFields.push(q);
        });
        
        dynamicKeys.forEach(k => { 
            // Try to map existing dynamicKeys to field names if they were saved as question text
            const mappedK = getFieldName(bot, k);
            if (!allFields.includes(mappedK)) allFields.push(mappedK); 
        });

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
