// Base62 conversion natively
const Base62 = {
  charset: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  encode: (int) => {
    if (int === 0n) return '0';
    let res = '';
    while (int > 0n) {
      res = Base62.charset[Number(int % 62n)] + res;
      int = int / 62n;
    }
    return res;
  },
  decode: (str) => {
    let res = 0n;
    for (let i = 0; i < str.length; i++) {
       res = res * 62n + BigInt(Base62.charset.indexOf(str[i]));
    }
    return res;
  }
};

const hexId = '69be43fa012c5'; // from JSON
const webhookId = 'sdiugGyR7gLaX8V'; // from Webhook!

console.log("Hex numeric:", BigInt('0x' + hexId).toString());
console.log("Webhook base62 decode:", Base62.decode(webhookId).toString());

// Another try: maybe the webhookid IS NOT encoded from the hexID, but is just a generic ID mapped in the BizzRiser database?
console.log("If they don't match, we must rely entirely on Retroactive Learning and fix the sequence step logic!");
