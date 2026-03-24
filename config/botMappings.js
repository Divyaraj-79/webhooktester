// config/botMappings.js
// Manual mappings for postbackIds that don't have buttonText in the webhook payload.
// This ensures 100% accuracy for known bot branches.

const botMappings = {
  // Chatbot For filter data (New JSON Map)
  "SNSiHmc-YTzqNNE": "Chatbot For filter data", // From user screenshot - represents start interaction
  "69be7b6caa82b": "Chatbot For filter data",
  "8rrr_dq0qPzTwlZ": "कारीगर / ऑपरेटर", // From user screenshot - represents artisan branch
  "69be7b6caa868": "कारीगर / ऑपरेटर",
  "69be7b6caa878": "हेल्पर / मजदुर",
  "69be7b6caa891": "कांट्रेक्टर/ ठेकेदार",
  "69be7b6caa8b5": "कमीशन / गाड़ी भाड़ा पर",
  "69be7b6caa8c7": "प्रति किलो या पीस",
  "69be7b6caa8ea": "दोनों तरह से",
  "69be7b6caa911": "1 - 20",
  "69be7b6caa924": "21 - 50",
  "69be7b6caa932": "50 से ज्यादा",
  "69be7b6caa985": "भट्ठी खाता / Casting",
  "69be7b6caa9b1": "फोर्जिंग खाता / Forging",
  "69be7b6caa9be": "CNC / VMC ऑपरेटर",
  "69be7b6caa9ce": "मशीन ऑपरेटर",
  "69be7b6caa9dc": "हार्डवेय़र / किचनवेय़र",
  "69be7b6caa9ee": "पैकिंग काम",
  "69be7b6caaa0e": "कंस्ट्रक्शन काम",
  "69be7b6caaa1b": "फेब्रिकेशन / वेल्डिंग",
  "69be7b6caaa2b": "हेल्पर (सभी काम के लिए)",
  "69be7b6caaa3a": "अन्य",
  "69be7b6caaa61": "हाँ / Yes",
  "69be7b6caaa72": "नहीं / No",

  // Previous mappings (if any relevant ones were needed to be preserved)
  "69be43fa012e3": "Greeting/Start",
  "69be43fa012f4": "कारीगर / ऑपरेटर",
  "69be43fa01304": "हेल्पर / मजदुर",
  "69be43fa0131d": "कांट्रेक्टर/ ठेकेदार"
};

module.exports = botMappings;
