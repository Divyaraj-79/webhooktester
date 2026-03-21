const ChatData = require('../models/ChatData');
const Bot = require('../models/Bot');

const BLACKLIST = [
    'user_input_data', 'chat_id', 'first_name', 'last_name', 
    'whatsapp_bot_username', 'id', 'updatedAt', 'createdAt', 
    'apiKey', 'sessionId', 'conversationId', '_id', '__v',
    'totalMessages', 'messages', 'bot_id', 'platform', 'customer_id'
];

function isTechnicalKey(key) {
    const cleanK = key.replace(/_DOT_/g, '.');
    if (BLACKLIST.includes(cleanK.toLowerCase())) return true;
    if (cleanK.startsWith('.')) return true;
    // Node IDs or long hex/UUIDs
    if (cleanK.match(/^node_/i) || cleanK.match(/^block_/i)) return true;
    if (cleanK.match(/^[0-9a-f]{24}$/i)) return true; // MongoDB ID
    if (cleanK.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) return true; // UUID
    return false;
}

// Helper to deeply flatten objects
function flattenObject(ob) {
    var toReturn = {};
    for (var i in ob) {
        if (!ob.hasOwnProperty(i)) continue;

        if (ob[i] !== null && typeof ob[i] === 'object' && !Array.isArray(ob[i])) {
            var flatObject = flattenObject(ob[i]);
            for (var x in flatObject) {
                if (!flatObject.hasOwnProperty(x)) continue;
                toReturn[i + '.' + x] = flatObject[x];
            }
        } else if (Array.isArray(ob[i])) {
            // Only stringify if it's not the user_input_data which we handle separately
            if (i !== 'user_input_data' && i !== 'messages') {
                toReturn[i] = JSON.stringify(ob[i]);
            }
        } else {
            toReturn[i] = ob[i];
        }
    }
    return toReturn;
}

exports.receiveWebhook = async (req, res) => {
    try {
        const apiKey = req.params.apiKey;
        const data = req.body;
        console.log(`📥 [webhookController] Webhook received for API Key: ${apiKey}`);
        console.log("📦 RAW PAYLOAD:", JSON.stringify(data, null, 2));

        const bot = await Bot.findOne({ apiKey });
        if (!bot) return res.status(404).json({ error: "Bot not found" });

        const flatData = flattenObject(data);

        // Heuristics for Session ID, Name, Phone
        let sessionId = flatData['chat_id'] || flatData['sessionId'] || flatData['id'] || flatData['conversationId'] || flatData['chat.id'] || "anon-" + Date.now();
        let name = flatData['first_name'] || flatData['name'] || flatData['userName'] || flatData['firstName'] || flatData['user.firstName'] || flatData['user.name'] || flatData['contact.name'] || '';
        let phone = flatData['whatsapp_bot_username'] || flatData['phone'] || flatData['phone_number'] || flatData['from'] || flatData['user.phone'] || flatData['contact.phone'] || flatData['wa_id'] || '';

        // Extract BizzRiser specific array if present
        let answersObj = {};
        if (Array.isArray(data.user_input_data)) {
            data.user_input_data.forEach(item => {
                if (item.question && item.answer) {
                    const cleanQ = String(item.question).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                    answersObj[cleanQ] = String(item.answer);
                }
            });
        }

        // Incorporate ALL flattened keys as answers EXCLUDING blacklist/technical
        for (const [key, value] of Object.entries(flatData)) {
            if (value !== null && value !== undefined && value !== '' && !isTechnicalKey(key)) {
                const cleanKey = String(key).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                answersObj[cleanKey] = String(value);
            }
        }
// ... [rest of the function maps to answersObj correctly]
        const setQuery = {
            sessionId,
            apiKey,
            owner: bot.owner, // Inherit from bot
        };
        if (name) setQuery.name = name;
        if (phone) setQuery.phone = phone;

        // Merge new answers
        Object.keys(answersObj).forEach(key => {
            const safeKey = key.replace(/\./g, '_DOT_');
            setQuery[`answers.${safeKey}`] = answersObj[key];
        });

        await ChatData.findOneAndUpdate(
            { sessionId, apiKey },
            { $set: setQuery },
            { upsert: true }
        );

        res.sendStatus(200);

    } catch (err) {
        console.error("❌ ERROR:", err);
        res.status(500).json({ error: "Webhook failed" });
    }
};

// Structured fetch
exports.getStructured = async (req, res) => {
    try {
        const apiKey = req.params.apiKey;
        // Restricting by owner
        const bot = await Bot.findOne({ apiKey, owner: req.user.id });
        const chats = await ChatData.find({ apiKey, owner: req.user.id });

        if (!bot) return res.status(404).json({ error: "Bot not found or unauthorized" });
// ... [rest of getStructured remains logic-identical but queries now include owner]
// I will rewrite fully for the tool
        const dynamicKeys = new Set();
        chats.forEach(chat => {
            Object.keys(chat.answers || {}).forEach(k => {
                const cleanK = k.replace(/_DOT_/g, '.');
                if (!isTechnicalKey(cleanK)) dynamicKeys.add(cleanK);
            });
        });

        const allFields = [...bot.fields];
        const existingFieldIds = new Set(allFields.map(f => f.fieldId));
        const existingFieldNames = new Set(allFields.map(f => f.fieldName.toLowerCase()));
        
        dynamicKeys.forEach(k => {
            if (!existingFieldIds.has(k) && !existingFieldNames.has(k.toLowerCase())) {
                allFields.push({ fieldId: k, fieldName: k, questionText: k });
            }
        });

        const formatted = chats.map(chat => {
            // Map postback IDs to button texts using bot.postbacks
            if (bot.postbacks && bot.postbacks.length > 0) {
                 Object.values(chat.answers || {}).forEach(val => {
                     if (typeof val === 'string') {
                         const matchedPb = bot.postbacks.find(p => p.postbackId === val);
                         if (matchedPb) {
                             chat.answers[matchedPb.sourceNodeName] = matchedPb.buttonText;
                         }
                     }
                 });
            }

            const row = {
                phone: chat.phone || "N/A",
                name: chat.name || "N/A",
            };

            allFields.forEach(field => {
                let answer = chat.answers[field.fieldId] || chat.answers[field.fieldId.replace(/\./g, '_DOT_')] || chat.answers[field.questionText];
                
                if (!answer && field.questionText) {
                    const cleanFieldQ = field.questionText.trim().toLowerCase();
                    const matchedKey = Object.keys(chat.answers).find(k => {
                        const cleanK = k.replace(/_DOT_/g, '.').trim().toLowerCase();
                        return cleanK === cleanFieldQ || (cleanFieldQ.length > 5 && (cleanK.includes(cleanFieldQ) || cleanFieldQ.includes(cleanK)));
                    });
                    if (matchedKey) answer = chat.answers[matchedKey];
                }

                if (answer !== undefined && answer !== null && typeof answer === 'object') {
                    answer = Object.values(answer)[0] || "N/A";
                }

                row[field.fieldName] = answer ? String(answer) : "N/A";
            });

            return row;
        });

        res.json(formatted);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fetch failed" });
    }
};

exports.getEntriesByApiKey = async (req, res) => {
    try {
        const { apiKey } = req.params;
        const userId = req.user.id;
        console.log(`🔍 [webhookController] Fetching entries for API Key: ${apiKey}, User: ${userId}`);

        const bot = await Bot.findOne({ apiKey, owner: userId });
        
        if (!bot) {
            console.log(`⚠️ [webhookController] Bot NOT found or NOT owned by user: ${userId}`);
            return res.status(404).json({ error: "Bot not found or unauthorized" });
        }

        const entries = await ChatData.find({ apiKey, owner: userId }).sort({ updatedAt: -1 });
        console.log(`📊 [webhookController] Found ${entries.length} entries for bot: ${apiKey}`);

        const dynamicKeys = new Set();
        entries.forEach(entry => {
            Object.keys(entry.answers || {}).forEach(k => {
                const cleanK = k.replace(/_DOT_/g, '.');
                if (!isTechnicalKey(cleanK) && cleanK.length < 100) {
                    dynamicKeys.add(cleanK);
                }
            });
        });

        const allFields = [...bot.fields];
        const existingFieldIds = new Set(allFields.map(f => f.fieldId));
        const existingFieldNames = new Set(allFields.map(f => f.fieldName.toLowerCase()));
        
        dynamicKeys.forEach(k => {
            if (!existingFieldIds.has(k) && !existingFieldNames.has(k.toLowerCase())) {
                allFields.push({ fieldId: k, fieldName: k, questionText: k });
            }
        });

        const formatted = entries.map(entry => {
            // Map postback IDs to button texts using bot.postbacks
            if (bot.postbacks && bot.postbacks.length > 0) {
                 Object.values(entry.answers || {}).forEach(val => {
                     if (typeof val === 'string') {
                         const matchedPb = bot.postbacks.find(p => p.postbackId === val);
                         if (matchedPb) {
                             entry.answers[matchedPb.sourceNodeName] = matchedPb.buttonText;
                         }
                     }
                 });
            }

            const row = {
                id: entry._id,
                name: entry.name || "N/A",
                phone: entry.phone || "N/A",
                updatedAt: entry.updatedAt
            };

            allFields.forEach(field => {
                const normFieldQ = field.questionText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                
                // Try direct match first
                let answer = entry.answers[field.fieldId] || entry.answers[field.fieldId.replace(/\./g, '_DOT_')] || entry.answers[field.questionText];
                
                // Try fuzzy normalized match
                if (!answer) {
                    const matchedKey = Object.keys(entry.answers).find(k => {
                        const cleanK = k.replace(/_DOT_/g, '.').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                        return cleanK === normFieldQ || (normFieldQ.length > 10 && (cleanK.includes(normFieldQ) || normFieldQ.includes(cleanK)));
                    });
                    if (matchedKey) answer = entry.answers[matchedKey];
                }

                if (answer !== undefined && answer !== null && typeof answer === 'object') {
                    answer = Object.values(answer)[0] || "N/A";
                }

                row[field.fieldName] = answer ? String(answer) : "N/A";
            });

            return row;
        });

        res.json({
            botName: "Chatbot Flow",
            fields: [...new Set(allFields.map(f => f.fieldName))],
            entries: formatted
        });

    } catch (err) {
        console.error("❌ [webhookController] Fetch entries error:", err);
        res.status(500).json({ error: "Failed to fetch entries" });
    }
};

