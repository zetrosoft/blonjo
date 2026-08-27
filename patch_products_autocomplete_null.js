const fs = require('fs');
const path = '/Users/user/kerjaan/jualan/blonjo/src/pages/material-control/RecommendedPurchase.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /custom_product_name: p_id \? undefined : p_name/g,
  "custom_product_name: p_id ? null : p_name"
);

fs.writeFileSync(path, code);
