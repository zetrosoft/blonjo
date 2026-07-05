const isRuleMatch = (ruleTarget, itemNameStr) => {
    const normalizeWords = (txt) => {
        return (txt || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/o/g, 'u').split(/\s+/).filter(w => w.length > 0);
    };
    
    const ruleWords = normalizeWords(ruleTarget);
    const itemWords = normalizeWords(itemNameStr);
    
    if (ruleWords.length === 0 || itemWords.length === 0) return false;
    
    // Check if ALL rule words are included in the item words (Subset match)
    const isSubset = ruleWords.every(rw => itemWords.some(iw => iw === rw || iw.includes(rw) || rw.includes(iw)));
    if (isSubset) return true;
    
    // Fallback to Dice Coefficient on sorted joined words for typos
    const getSortedString = (words) => [...words].sort().join('');
    const target = getSortedString(ruleWords);
    const item = getSortedString(itemWords);
    
    if (target === item) return true;
    if (item.includes(target)) return true; // Just in case
    
    const diceCoefficient = (s1, s2) => {
        if (s1 === s2) return 1;
        if (s1.length < 2 || s2.length < 2) return 0;
        const bg1 = new Map();
        for (let i = 0; i < s1.length - 1; i++) {
            const bg = s1.substring(i, i + 2);
            bg1.set(bg, (bg1.get(bg) || 0) + 1);
        }
        const bg2 = new Map();
        for (let i = 0; i < s2.length - 1; i++) {
            const bg = s2.substring(i, i + 2);
            bg2.set(bg, (bg2.get(bg) || 0) + 1);
        }
        let intersection = 0;
        for (const [bg, count] of bg1.entries()) {
            if (bg2.has(bg)) {
                intersection += Math.min(count, bg2.get(bg));
            }
        }
        return (2.0 * intersection) / (s1.length - 1 + s2.length - 1);
    };
    
    return diceCoefficient(target, item) >= 0.80;
};

console.log("Shinzui Sabun vs Sabun Shinsui:", isRuleMatch("Shinzui Sabun", "Sabun Shinsui"));
