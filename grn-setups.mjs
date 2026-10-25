export function categoryPrefix(category){
 return String(category.Prefix||category.Name?.trim().charAt(0)||'').toUpperCase();
}
export function validateGRNSetups(tables,previous){
 const categories=tables['Item Main Category']||[];
 for(const category of categories){
  if(!/^\d{3}$/.test(category.Code)||!category.Name?.trim()||!/^[A-Z]$/.test(categoryPrefix(category)))throw Error('Item Main Category requires a three-digit code, a name and a single-letter ID prefix');
 }
 const items=new Map((tables['Item Master Setup']||[]).map(item=>[item.Code,item]));
 const previousReceipts=new Map((previous['GRN (Goods Received Note)']||[]).map(r=>[r.Code,r]));
 for(const receipt of tables['GRN (Goods Received Note)']||[])for(const line of receipt._lines||[]){
  const unchanged=previousReceipts.get(receipt.Code)?._lines?.some(old=>JSON.stringify(old)===JSON.stringify(line));
  if(unchanged||line['Coil ID'])continue;
  if(!line['Coil Code']&&!line['Coil Type'])continue;
  const category=categories.find(c=>c.Code===line['Coil Code']);
  if(!category||category.Name!==line['Coil Type'])throw Error('Select the matching coil type and code from Item Main Category');
  const item=items.get(line['Item Code']);if(!item||!item.Description?.trim())throw Error('Select an item from GRN Item Setup');
  line['Item Description']=item.Description;
 }
}
