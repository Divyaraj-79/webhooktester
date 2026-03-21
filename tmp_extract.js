const fs = require('fs');

const filename = process.argv[2];

if (!filename) {
    console.error("Please provide a filename.");
    process.exit(1);
}

try {
    const data = fs.readFileSync(filename, 'utf8');
    const botJson = JSON.parse(data);
    const nodes = botJson.nodes;
    const mappings = {};

    Object.values(nodes).forEach(node => {
        const data = node.data;
        if (!data) return;

        // Standard Buttons/Inline Buttons
        if (data.postbackId && (data.buttonText || data.title)) {
            const text = (data.buttonText || data.title).trim();
            mappings[data.postbackId] = text;
        }

        // List Rows (often have postbackId)
        if (data.rows && Array.isArray(data.rows)) {
            data.rows.forEach(row => {
                if (row.postbackId && row.title) {
                    mappings[row.postbackId] = row.title.trim();
                }
            });
        }
        
        // Some nodes have buttonText but use uniqueId or other fields? 
        // According to the JSON, 'postbackId' is the key we need.
    });

    console.log(JSON.stringify(mappings, null, 2));
} catch (e) {
    console.error("Failed to parse JSON:", e.message);
}
