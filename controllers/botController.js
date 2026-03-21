const Bot = require('../models/Bot');
const crypto = require('crypto');

// Upload chatbot JSON
exports.uploadBot = async (req, res) => {
    try {
        console.log("📥 [botController] New Bot Upload started");
        const botData = req.body;
        
        const fieldsMap = new Map();
        const postbacksMap = new Map();

        // extract postbacks
        function searchForPostbacks(obj, nodeName) {
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
                if (Array.isArray(obj)) {
                    obj.forEach(item => searchForPostbacks(item, nodeName));
                }
                return;
            }
            if (obj.postbackId && typeof obj.postbackId === 'string') {
                postbacksMap.set(obj.postbackId, {
                    postbackId: obj.postbackId,
                    buttonText: obj.buttonText || obj.title || obj.text || 'Button Clicked',
                    sourceNodeName: nodeName || 'Button'
                });
            }
            if (obj.xitFbpostbackId && typeof obj.xitFbpostbackId === 'string') {
                postbacksMap.set(obj.xitFbpostbackId, {
                    postbackId: obj.xitFbpostbackId,
                    buttonText: obj.buttonText || obj.title || obj.text || 'Button Clicked',
                    sourceNodeName: nodeName || 'Button'
                });
            }
            if (obj.name && obj.data) {
                // Top level node object
                searchForPostbacks(obj.data, obj.name);
            } else {
                Object.values(obj).forEach(val => searchForPostbacks(val, nodeName));
            }
        }


        // Universal heuristic recursive search
        function searchForFields(obj, depth = 0) {
            if (!obj || typeof obj !== 'object' || depth > 20) return;

            if (Array.isArray(obj)) {
                obj.forEach(item => searchForFields(item, depth + 1));
                return;
            }

            const varKeys = ['customField', 'customFieldId', 'variable', 'variableId', 'key', 'fieldName', 'name', 'id'];
            const labelKeys = ['customFieldSelectedOptionText', 'question', 'text', 'label', 'prompt', 'title', 'placeholder'];

            let foundVar = null;
            let foundLabel = null;

            for (const k of varKeys) {
                if (obj[k] && typeof obj[k] === 'string' && obj[k] !== 'Select' && obj[k].length < 100) {
                    const lowerK = obj[k].toLowerCase();
                    if (!lowerK.includes('node_') && !lowerK.includes('block_') && !obj[k].match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) {
                        foundVar = obj[k];
                        break;
                    }
                }
            }

            for (const k of labelKeys) {
                if (obj[k] && typeof obj[k] === 'string' && obj[k] !== 'Select' && obj[k].length < 200) {
                    foundLabel = obj[k];
                    break;
                }
            }

            if (foundVar) {
                let originalLabel = foundLabel || foundVar;
                let finalLabel = originalLabel;
                if (finalLabel.length > 50) {
                    finalLabel = finalLabel.substring(0, 50) + '...';
                }
                
                // Normalize question text
                const cleanQText = originalLabel.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

                fieldsMap.set(foundVar, {
                    fieldId: foundVar,
                    fieldName: finalLabel,
                    questionText: cleanQText
                });
            }

            Object.values(obj).forEach(val => searchForFields(val, depth + 1));
        }

        searchForFields(botData);
        if (botData && botData.nodes) {
            Object.values(botData.nodes).forEach(node => searchForPostbacks(node, node.name || 'Button'));
        } else {
            searchForPostbacks(botData, 'Button');
        }

        const fields = Array.from(fieldsMap.values());
        const postbacks = Array.from(postbacksMap.values());
        console.log("🔍 [botController] Extracted fields count:", fields.length);
        console.log("🔍 [botController] Extracted postbacks count:", postbacks.length);

        const apiKey = crypto.randomBytes(16).toString('hex');

        const bot = await Bot.create({
            apiKey,
            owner: req.user.id, // Linked to user
            fields,
            postbacks
        });

        res.json({
            message: "Bot uploaded successfully",
            apiKey,
            fields: [...new Set(fields.map(f => f.fieldName))]
        });

    } catch (err) {
        console.error("❌ [botController] Upload error:", err);
        res.status(500).json({ error: "Upload failed" });
    }
};

exports.getMyBots = async (req, res) => {
    try {
        const bots = await Bot.find({ owner: req.user.id });
        res.json(bots);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch bots" });
    }
};