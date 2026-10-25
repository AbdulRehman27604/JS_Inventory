// Use the browser's local calendar date; UTC conversion can pick the wrong day near midnight.
export function localISODate(now=new Date()){
 return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
