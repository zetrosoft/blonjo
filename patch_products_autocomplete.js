const fs = require('fs');
const path = '/Users/user/kerjaan/jualan/blonjo/src/pages/material-control/RecommendedPurchase.tsx';
let code = fs.readFileSync(path, 'utf8');

// Add products state and load function
const stateInjectRegex = /const \[plans, setPlans\] = useState<PurchasePlan\[\]>\(\[\]\);/;
code = code.replace(stateInjectRegex, (match) => {
  return match + `\n  const [products, setProducts] = useState<any[]>([]);\n  useEffect(() => { fetchClient('/inventory/products').then(res => setProducts(res.data || res)).catch(() => {}); }, []);`;
});

// Fix addingToPlan and newItem state
const newItemStateRegex = /const \[newItem, setNewItem\] = useState\(\{ name: '', qty: 1, unit_price: 0 \}\);/;
code = code.replace(newItemStateRegex, `const [newItem, setNewItem] = useState({ name: '', qty: 1, unit_price: 0, unit: 'pcs', product_id: null as number | null });`);

// Fix handleAddNewItem
const handleAddRegex = /const handleAddNewItem = \(plan: PurchasePlan\) => \{[\s\S]*?setNewItem\(\{ name: '', qty: 1, unit_price: 0 \}\);\n  \};/;
code = code.replace(handleAddRegex, `const handleAddNewItem = (plan: PurchasePlan) => {
    if (!newItem.name) return;
    setPlans(prev => prev.map(p => {
      if (p.id !== plan.id) return p;
      const fakeId = -Math.floor(Math.random() * 1000000);
      let p_id = newItem.product_id;
      let p_name = newItem.name;
      // If no product_id selected, try to find by exact name
      if (!p_id) {
        const found = products.find(prod => prod.name.toLowerCase() === newItem.name.toLowerCase());
        if (found) {
          p_id = found.id;
          p_name = found.name;
        } else {
          // If custom, append unit
          p_name = \`\${newItem.name} (\${newItem.unit})\`;
        }
      }
      
      const newItems = [...p.items, {
        id: fakeId,
        product_id: p_id,
        custom_product_name: p_id ? undefined : p_name,
        product_name: p_name,
        sku: 'N/A',
        supplier_contact_id: null,
        supplier_name: null,
        qty: newItem.qty,
        unit_price: newItem.unit_price,
        subtotal: newItem.qty * newItem.unit_price,
        is_purchased: false
      }];
      return {
        ...p,
        items: newItems,
        total_amount: newItems.reduce((s, it) => s + (Number(it.qty) * Number(it.unit_price)), 0)
      };
    }));
    setAddingToPlan(null);
    setNewItem({ name: '', qty: 1, unit_price: 0, unit: 'pcs', product_id: null });
  };`);

// Update the inline form rendering
const inlineFormRegex = /<Input placeholder="Nama barang..." className="h-8 text-xs flex-1" value=\{newItem\.name\} onChange=\{e => setNewItem\(\{\.\.\.newItem, name: e\.target\.value\}\)\} \/>/;
code = code.replace(inlineFormRegex, `<div className="flex-1 relative">
                                  <Input 
                                    list="product-suggestions" 
                                    placeholder="Nama barang..." 
                                    className="h-8 text-xs w-full" 
                                    value={newItem.name} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      const found = products.find(p => p.name === val);
                                      if (found) {
                                        setNewItem({...newItem, name: val, product_id: found.id, unit_price: found.purchase_price || 0, unit: found.base_unit || 'pcs'});
                                      } else {
                                        setNewItem({...newItem, name: val, product_id: null});
                                      }
                                    }} 
                                  />
                                  <datalist id="product-suggestions">
                                    {products.map(p => <option key={p.id} value={p.name} />)}
                                  </datalist>
                                </div>
                                <select 
                                  className="h-8 text-xs border border-zinc-200 dark:border-zinc-700 bg-transparent rounded px-2"
                                  value={newItem.unit}
                                  onChange={e => setNewItem({...newItem, unit: e.target.value})}
                                  disabled={!!newItem.product_id}
                                >
                                  <option value="pcs">pcs</option>
                                  <option value="kg">kg</option>
                                  <option value="liter">liter</option>
                                  <option value="box">box</option>
                                  <option value="pack">pack</option>
                                  <option value="lusin">lusin</option>
                                </select>`);

fs.writeFileSync(path, code);
