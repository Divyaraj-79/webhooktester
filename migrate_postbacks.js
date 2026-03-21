const mongoose = require('mongoose');
require('dotenv').config();
const Bot = require('./models/Bot');
const ChatData = require('./models/ChatData');

// This script retroactively applies learned postback mappings to ALL existing entries.
// Step 1: For each bot with webhookHistory, find button-click calls and learn the mapping.
// Step 2: Apply the mapping to fix existing answers—replacing raw postbackid field value
//         with the proper "Inline Button" answer.

async function migrate() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected. Starting retroactive migration...');

    // Get all bots that have postbacks defined
    const bots = await Bot.find({ 'postbacks.0': { $exists: true } });
    console.log(`Found ${bots.length} bots with postbacks.`);

    for (const bot of bots) {
        console.log(`\nProcessing bot: ${bot.apiKey.substring(0, 12)}...`);

        const inlineButtonOptions = (bot.postbacks || []).filter(p => p.sourceNodeName === 'Inline Button');
        if (inlineButtonOptions.length === 0) {
            console.log('  No Inline Button postbacks, skipping.');
            continue;
        }
        console.log(`  Inline button options: ${inlineButtonOptions.map(p => p.buttonText.trim()).join(', ')}`);

        // Gather all entries that have webhookHistory
        const entries = await ChatData.find({ apiKey: bot.apiKey });
        let learnedMap = new Map((bot.learnedPostbacks || []).map(p => [p.runtimePostbackId, p]));
        let learnedUpdated = false;

        for (const entry of entries) {
            const history = entry.webhookHistory || [];
            const buttonCalls = history.filter(h => {
                const p = h.payload;
                const postbackid = (p.postbackid || '').trim();
                return postbackid.length > 0 &&
                       Array.isArray(p.user_input_data) &&
                       p.user_input_data.length === 0 &&
                       !p.user_message;
            });

            for (const h of buttonCalls) {
                const pid = h.payload.postbackid.trim();
                if (!learnedMap.has(pid)) {
                    const nextIndex = learnedMap.size;
                    if (nextIndex < inlineButtonOptions.length) {
                        const nextButton = inlineButtonOptions[nextIndex];
                        learnedMap.set(pid, {
                            runtimePostbackId: pid,
                            buttonText: nextButton.buttonText,
                            sourceNodeName: nextButton.sourceNodeName
                        });
                        learnedUpdated = true;
                        console.log(`  Learned: "${pid}" → "${nextButton.buttonText.trim()}"`);
                    }
                }
            }
        }

        // Save learned postbacks if new ones discovered
        if (learnedUpdated) {
            await Bot.findByIdAndUpdate(bot._id, {
                $set: { learnedPostbacks: Array.from(learnedMap.values()) }
            });
            console.log(`  Saved ${learnedMap.size} learned postbacks to bot.`);
        }

        // Now retroactively fix all entry answers
        let fixedCount = 0;
        for (const entry of entries) {
            let needsUpdate = false;
            const updateOps = {};

            // If answers.postbackid is a known runtime ID, resolve it
            const storedPostbackId = (entry.answers && entry.answers.postbackid) || '';
            if (storedPostbackId && learnedMap.has(storedPostbackId)) {
                const mapping = learnedMap.get(storedPostbackId);
                updateOps['answers.Inline Button'] = mapping.buttonText.trim();
                needsUpdate = true;
            }

            // Also check all answer values for any that are runtime postbackids
            for (const [k, v] of Object.entries(entry.answers || {})) {
                if (typeof v === 'string' && learnedMap.has(v)) {
                    const mapping = learnedMap.get(v);
                    updateOps[`answers.${mapping.sourceNodeName}`] = mapping.buttonText.trim();
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                await ChatData.findByIdAndUpdate(entry._id, { $set: updateOps });
                fixedCount++;
            }
        }

        if (fixedCount > 0) {
            console.log(`  Fixed ${fixedCount} chat entries with button text.`);
        } else {
            console.log('  No entries needed fixing.');
        }
    }

    console.log('\nMigration complete.');
    process.exit();
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
