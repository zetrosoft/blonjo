import re

with open("src/pages/master-data/PricingRulePage.tsx", "r") as f:
    content = f.read()

imports = """
import { Textarea } from '../../components/ui/textarea';
import { useRef, useEffect } from 'react';
"""
content = re.sub(r"import \{ Textarea \} from '\.\.\/\.\.\/components\/ui\/textarea';", imports, content)


state_vars = """
  // State for @ mention autocomplete
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const handleStoryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setStory(val);
    
    // Check for @ mention
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9 ]*)$/);
    
    if (match) {
      setShowMention(true);
      setMentionQuery(match[1].toLowerCase());
      setMentionIndex(cursor - match[0].length);
    } else {
      setShowMention(false);
    }
  };
  
  const handleMentionSelect = (productName: string) => {
    const textBefore = story.slice(0, mentionIndex);
    const textAfter = story.slice(textareaRef.current?.selectionStart || story.length);
    const newStory = `${textBefore}${productName} ${textAfter}`;
    setStory(newStory);
    setShowMention(false);
    
    // Focus and move cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = textBefore.length + productName.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };
"""
content = re.sub(r"const \[isParsing, setIsParsing\] = useState\(false\);", "const [isParsing, setIsParsing] = useState(false);\n" + state_vars, content)


textarea_replacement = """
                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      placeholder={t('pr_textarea_placeholder')}
                      value={story}
                      onChange={handleStoryChange}
                      className="min-h-[220px] bg-background border-indigo-500/20 focus-visible:ring-indigo-500/30 pr-14 text-sm leading-relaxed"
                    />
                    
                    {showMention && (
                      <div className="absolute z-30 bg-background border rounded-md shadow-lg w-64 max-h-48 overflow-y-auto" style={{ top: 'auto', bottom: '100%', left: '0' }}>
                        <div className="p-1">
                          <div className="text-xs text-muted-foreground px-2 py-1 font-semibold bg-muted/30">Pilih Produk:</div>
                          {products.filter(p => p.name.toLowerCase().includes(mentionQuery)).slice(0, 10).map(p => (
                            <button
                              key={p.id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950 transition-colors"
                              onClick={() => handleMentionSelect(p.name)}
                            >
                              <div className="font-medium">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{p.sku}</div>
                            </button>
                          ))}
                          {products.filter(p => p.name.toLowerCase().includes(mentionQuery)).length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground italic">Tidak ada produk cocok</div>
                          )}
                        </div>
                      </div>
                    )}
"""
content = content.replace("""                  <div className="relative">
                    <Textarea
                      placeholder={t('pr_textarea_placeholder')}
                      value={story}
                      onChange={(e) => setStory(e.target.value)}
                      className="min-h-[220px] bg-background border-indigo-500/20 focus-visible:ring-indigo-500/30 pr-14 text-sm leading-relaxed"
                    />""", textarea_replacement)


with open("src/pages/master-data/PricingRulePage.tsx", "w") as f:
    f.write(content)

print("Autocomplete patched!")
