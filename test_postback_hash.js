// test_postback_hash.js
// Test if runtime postbackId = some hash of (phone + staticPostbackId)
const crypto = require('crypto');

// From the database: this user's phone and the runtime IDs they sent
const phone = '916353239919';
const runtimeIds = ['sdiugGyR7gLaX8V', '6jubhpyMBURs6jI', '1aAMuKL1rWwI3D8', 'SNSiHmc-YTzqNNE'];

// Static postbackIds from the bot JSON (first question's 3 buttons)
const staticPostbackIds = [
    '69be43fa012f4',   // button 26: कारीगर / ऑपरेटर
    '69be43fa0130b',   // button 27: हेल्पर / मजदूर
    '69be43fa0131d',   // button 28: कांट्रेक्टर/ ठेकेदार
];

const newPostbackIds = [
    '69be43fa012fa',   // newPostbackId for button 26
    '69be43fa01313',   // newPostbackId for button 27
    '69be43fa01322',   // newPostbackId for button 28
];

console.log('Runtime IDs we need to match:', runtimeIds);
console.log('Static IDs from JSON:', staticPostbackIds);
console.log('\n--- Testing hash functions ---\n');

function tryHash(label, hashFn) {
    const results = staticPostbackIds.map(s => hashFn(s).substring(0, 15));
    const matches = results.filter(r => runtimeIds.includes(r));
    if (matches.length > 0) {
        console.log(`✅ ${label}: MATCH FOUND!`, results);
    }
    return results;
}

// Try various hash combinations
const hashes = [
    ['MD5(static)', s => crypto.createHash('md5').update(s).digest('base64').replace(/[+/=]/g, '')],
    ['SHA1(static)', s => crypto.createHash('sha1').update(s).digest('base64').replace(/[+/=]/g, '')],
    ['MD5(phone+static)', s => crypto.createHash('md5').update(phone + s).digest('base64').replace(/[+/=]/g, '')],
    ['MD5(static+phone)', s => crypto.createHash('md5').update(s + phone).digest('base64').replace(/[+/=]/g, '')],
    ['SHA256(phone+static)', s => crypto.createHash('sha256').update(phone + s).digest('base64').replace(/[+/=]/g, '')],
];

hashes.forEach(([label, fn]) => tryHash(label, fn));

// Try base64 decode of runtime IDs
console.log('\n--- Decode attempts ---');
runtimeIds.forEach(id => {
    try {
        const decoded = Buffer.from(id, 'base64').toString('hex');
        console.log(`  ${id} → base64decode → ${decoded}`);
    } catch(e) {}
    
    // Is it base62?
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const hasSpecial = [...id].some(c => !chars.includes(c));
    console.log(`  ${id}: all-alphanumeric: ${!hasSpecial}, length: ${id.length}`);
});

// Check if runtime IDs follow any pattern relative to each other
console.log('\n--- Runtime ID Analysis ---');
console.log('Are all 15 chars?', runtimeIds.every(id => id.length === 15));
console.log('Same structure (upper+lower+digit)?', runtimeIds.map(id => ({
    id,
    upper: id.replace(/[^A-Z]/g, '').length,
    lower: id.replace(/[^a-z]/g, '').length,
    digit: id.replace(/[^0-9]/g, '').length,
})));
