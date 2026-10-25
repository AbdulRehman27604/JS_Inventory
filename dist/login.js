const form=document.querySelector('#login'),error=document.querySelector('#error'),button=form.querySelector('button');
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;error.textContent='';
 try{
 const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.username.value,password:form.password.value})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to sign in');
 form.reset();location.replace('/');
 }catch(e){error.textContent=e.message;form.password.value='';}finally{button.disabled=false;}
});
