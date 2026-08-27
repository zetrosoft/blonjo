const fs = require('fs');
const path = '/Users/user/kerjaan/jualan/blonjo/src/pages/material-control/RecommendedPurchase.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /fetchClient\('\/inventory\/products'\)\.then\(res => setProducts\(res\.data \|\| res\)\)/,
  "fetchClient('/inventory/products').then((data: any) => { const prod = Array.isArray(data) ? data : (data.items || []); setProducts(prod); })"
);

fs.writeFileSync(path, code);
