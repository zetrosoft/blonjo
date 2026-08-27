const fs = require('fs');
const path = '/Users/user/kerjaan/jualan/blonjo/src/pages/material-control/RecommendedPurchase.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add savingId and handleSavePlanChanges
const handleCompleteRegex = /const handleComplete = async.*?};/s;
code = code.replace(handleCompleteRegex, (match) => {
  return match + `\n
  const [savingId, setSavingId] = useState<number | null>(null);
  const [addingToPlan, setAddingToPlan] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ name: '', qty: 1, unit_price: 0 });

  const handleSavePlanChanges = async (plan: PurchasePlan, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavingId(plan.id);
    try {
      const payload = {
        planned_date: plan.planned_date,
        items: plan.items.map(it => ({
          product_id: it.product_id,
          custom_product_name: (!it.product_id) ? (it.custom_product_name || it.product_name) : undefined,
          supplier_contact_id: it.supplier_contact_id,
          qty: it.qty,
          unit_price: it.unit_price,
          is_purchased: it.is_purchased
        }))
      };
      await fetchClient(\`/material-control/purchase-plans/\${plan.id}\`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      toast.success("Perubahan berhasil disimpan");
      loadPlans();
    } catch (err) {
      toast.error("Gagal menyimpan perubahan");
    } finally {
      setSavingId(null);
    }
  };
  
  const handleDeleteItem = (planId: number, itemId: number) => {
    setPlans(prev => prev.map(p => {
      if (p.id !== planId) return p;
      const newItems = p.items.filter(it => it.id !== itemId);
      return {
        ...p,
        items: newItems,
        total_amount: newItems.reduce((s, it) => s + (Number(it.qty) * Number(it.unit_price)), 0)
      };
    }));
  };
  
  const handleAddNewItem = (plan: PurchasePlan) => {
    if (!newItem.name) return;
    setPlans(prev => prev.map(p => {
      if (p.id !== plan.id) return p;
      const fakeId = -Math.floor(Math.random() * 1000000);
      const newItems = [...p.items, {
        id: fakeId,
        product_id: null,
        custom_product_name: newItem.name,
        product_name: newItem.name,
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
    setNewItem({ name: '', qty: 1, unit_price: 0 });
  };
`;
});

// 2. Change the planned_date rendering
const dateRenderRegex = /<span className="flex items-center gap-1">[\s\S]*?<Calendar className="h-3 w-3" \/>[\s\S]*?\{t\('mc_rp_date'\)\}: <strong className="text-zinc-700 dark:text-zinc-300 ml-1">\{formatDate\(plan\.planned_date\)\}<\/strong>[\s\S]*?<\/span>/;
code = code.replace(dateRenderRegex, `
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t('mc_rp_date')}:
                          {isActive ? (
                            <input 
                              type="date" 
                              className="ml-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded px-1 py-0.5 bg-transparent dark:text-zinc-300" 
                              value={plan.planned_date.split('T')[0]} 
                              onChange={e => {
                                const newDate = e.target.value;
                                setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, planned_date: newDate } : p));
                              }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <strong className="text-zinc-700 dark:text-zinc-300 ml-1">{formatDate(plan.planned_date)}</strong>
                          )}
                        </span>
`);

// 3. Display custom_product_name properly
const productNameRegex = /<div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">\{item\.product_name\}<\/div>/g;
code = code.replace(productNameRegex, `<div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.custom_product_name || item.product_name}</div>`);

// 4. Add delete item button to the action column (I'll reuse the status column or add a new one, but let's just put it in the status column next to the badge if active)
const statusCellRegex = /<TableCell className="py-3 text-center">([\s\S]*?)<\/TableCell>/g;
let i = 0;
code = code.replace(statusCellRegex, (match, inner) => {
  if (i++ === 0) return match; // skip first (tab 1)
  return `
    <TableCell className="py-3 text-center">
      <div className="flex items-center justify-center gap-2">
        ${inner}
        {isActive && !item.is_purchased && (
          <button onClick={() => handleDeleteItem(plan.id, item.id)} className="text-zinc-400 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </TableCell>
  `;
});

// 5. Add "Add Item" row and Save button
const tableEndRegex = /<\/TableBody>\s*<\/Table>\s*<\/div>/g;
let tableEndCount = 0;
code = code.replace(tableEndRegex, (match) => {
  tableEndCount++;
  if (tableEndCount === 1) return match; // skip tab 1
  return `
                            </TableBody>
                          </Table>
                        </div>
                        {isActive && (
                          <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/10">
                            {addingToPlan === plan.id ? (
                              <div className="flex items-center gap-2">
                                <Input placeholder="Nama barang..." className="h-8 text-xs flex-1" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                                <Input type="number" placeholder="Qty" className="h-8 w-20 text-xs" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: Number(e.target.value)})} />
                                <Input type="number" placeholder="Harga" className="h-8 w-28 text-xs" value={newItem.unit_price} onChange={e => setNewItem({...newItem, unit_price: Number(e.target.value)})} />
                                <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700" onClick={() => handleAddNewItem(plan)}>Tambah</Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setAddingToPlan(null)}><X className="w-4 h-4" /></Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="outline" className="h-8 text-xs border-dashed" onClick={() => setAddingToPlan(plan.id)}>
                                <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Item Baru
                              </Button>
                            )}
                          </div>
                        )}
  `;
});

// 6. Add "Simpan Perubahan" button next to execute buttons
const executeButtonsRegex = /<div className="flex items-center gap-2">\s*<Button\s*size="sm" variant="outline"\s*className="gap-1.5 h-8 text-xs border-amber-300/;
code = code.replace(executeButtonsRegex, `
<div className="flex items-center gap-2">
                              <Button
                                size="sm" variant="outline"
                                className="gap-1.5 h-8 text-xs"
                                onClick={(e) => handleSavePlanChanges(plan, e)}
                                disabled={savingId === plan.id}
                              >
                                {savingId === plan.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                Simpan Perubahan
                              </Button>
                              <Button
                                size="sm" variant="outline"
                                className="gap-1.5 h-8 text-xs border-amber-300
`.trim());

fs.writeFileSync(path, code);
